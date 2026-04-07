import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCandidateAuthFromRequest } from "@/lib/auth";
import { connectMongo } from "@/lib/mongodb";
import Service from "@/lib/models/Service";
import User from "@/lib/models/User";
import VerificationRequest from "@/lib/models/VerificationRequest";

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_QUESTION_ICON_KEY = "diary";
const SUPPORTED_QUESTION_ICON_KEYS = new Set([
  "none",
  "diary",
  "house",
  "pen",
  "calendar",
  "phone",
  "location",
  "id-card",
  "document",
  "work",
  "person",
  "email",
  "company",
  "global",
  "security",
]);

const submitSchema = z.object({
  requestId: z.string().min(1),
  responses: z.array(
    z.object({
      serviceId: z.string().min(1),
      answers: z.array(
        z.object({
          fieldKey: z.string().optional().default(""),
          question: z.string().min(1),
          value: z.string().optional().default(""),
          repeatable: z.boolean().optional().default(false),
          notApplicable: z.boolean().optional().default(false),
          notApplicableText: z.string().optional().default(""),
          fileName: z.string().optional().default(""),
          fileMimeType: z.string().optional().default(""),
          fileSize: z.number().nullable().optional().default(null),
          fileData: z.string().optional().default(""),
        }),
      ),
    }),
  ),
});

function supportsLengthConstraints(fieldType: string) {
  return fieldType === "text" || fieldType === "long_text" || fieldType === "number";
}

function supportsLengthTruncation(fieldType: string) {
  return fieldType === "text" || fieldType === "long_text";
}

function resolveLengthComparableValue(value: string, fieldType: string) {
  if (fieldType === "number") {
    return value.replace(/\D/g, "");
  }

  return value;
}

function resolveLengthUnit(fieldType: string) {
  return fieldType === "number" ? "digits" : "characters";
}

function applyAnswerFormatting(
  rawValue: string,
  field: {
    fieldType: "text" | "long_text" | "number" | "file" | "date";
    forceUppercase?: boolean;
    maxLength?: number | null;
  },
) {
  let nextValue = rawValue;

  if (field.forceUppercase) {
    nextValue = nextValue.toUpperCase();
  }

  if (
    supportsLengthTruncation(field.fieldType) &&
    typeof field.maxLength === "number" &&
    field.maxLength > 0
  ) {
    nextValue = nextValue.slice(0, field.maxLength);
  }

  return nextValue;
}

function parseRepeatableValues(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item ?? ""));
    }
  } catch {
    // Keep backward compatibility for old non-JSON values.
  }

  return [rawValue];
}

function normalizeServiceId(serviceId: unknown) {
  return String(serviceId);
}

function resolveFieldKey(rawFieldKey: unknown, question: string, index: number) {
  const normalizedFieldKey = String(rawFieldKey ?? "").trim();
  if (normalizedFieldKey) {
    return normalizedFieldKey;
  }

  const normalizedQuestion = question
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  return `legacy_${normalizedQuestion || "field"}_${index + 1}`;
}

function normalizeQuestionIconKey(rawIconKey: unknown) {
  if (typeof rawIconKey !== "string") {
    return DEFAULT_QUESTION_ICON_KEY;
  }

  const normalized = rawIconKey.trim().toLowerCase();
  return SUPPORTED_QUESTION_ICON_KEYS.has(normalized)
    ? normalized
    : DEFAULT_QUESTION_ICON_KEY;
}

function candidateOwnershipFilter(candidateEmail: string, candidateUserId: string) {
  return {
    candidateEmail,
    $or: [
      { candidateUser: candidateUserId },
      { candidateUser: null },
      { candidateUser: { $exists: false } },
    ],
  };
}

export async function GET(req: NextRequest) {
  const auth = await getCandidateAuthFromRequest(req);
  if (!auth || auth.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectMongo();

  const candidate = await User.findById(auth.userId).select("email role").lean();
  if (!candidate || candidate.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidateEmail = candidate.email.trim().toLowerCase();

  const items = await VerificationRequest.find(
    candidateOwnershipFilter(candidateEmail, auth.userId),
  )
    .sort({ createdAt: -1 })
    .lean();

  const customerIds = [...new Set(items.map((item) => String(item.customer)))];
  const customers =
    customerIds.length > 0
      ? await User.find({ _id: { $in: customerIds } }).select("name email").lean()
      : [];
  const customerMap = new Map(
    customers.map((customer) => [String(customer._id), customer]),
  );

  const selectedServiceIds = [
    ...new Set(
      items.flatMap((item) =>
        (item.selectedServices ?? []).map((service) => normalizeServiceId(service.serviceId)),
      ),
    ),
  ];

  const services =
    selectedServiceIds.length > 0
      ? await Service.find({ _id: { $in: selectedServiceIds } })
          .select("name allowMultipleEntries multipleEntriesLabel formFields")
          .lean()
      : [];

  const serviceMap = new Map(
    services.map((service) => [
      String(service._id),
      {
        name: service.name,
        allowMultipleEntries: Boolean(service.allowMultipleEntries),
          multipleEntriesLabel: service.multipleEntriesLabel ?? undefined,
        formFields: (service.formFields ?? []).map((field, index) => ({
          fieldKey: resolveFieldKey(field.fieldKey, field.question, index),
          question: field.question,
          iconKey: normalizeQuestionIconKey(field.iconKey),
          fieldType: field.fieldType,
          required: Boolean(field.required),
          repeatable: field.fieldType === "file" ? false : Boolean(field.repeatable),
          minLength: typeof field.minLength === "number" ? field.minLength : null,
          maxLength: typeof field.maxLength === "number" ? field.maxLength : null,
          forceUppercase: Boolean(field.forceUppercase),
          allowNotApplicable: Boolean(field.allowNotApplicable),
          notApplicableText: field.notApplicableText?.trim() || "Not Applicable",
        })),
      },
    ]),
  );

  const enriched = items.map((item) => {
    const customer = customerMap.get(String(item.customer));
    const selectedServices = (item.selectedServices ?? []).map((service) => ({
      serviceId: normalizeServiceId(service.serviceId),
      serviceName: service.serviceName,
      price: service.price,
      currency: service.currency,
    }));

    return {
      _id: String(item._id),
      candidateName: item.candidateName,
      candidateEmail: item.candidateEmail,
      candidatePhone: item.candidatePhone,
      customerName: customer?.name ?? "Unknown",
      customerEmail: customer?.email ?? "Unknown",
      status: item.status,
      candidateFormStatus: item.candidateFormStatus ?? "pending",
      candidateSubmittedAt: item.candidateSubmittedAt ?? null,
      rejectionNote: item.rejectionNote ?? "",
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      selectedServices,
      serviceForms: selectedServices.map((selectedService) => ({
        serviceId: selectedService.serviceId,
        serviceName: selectedService.serviceName,
        allowMultipleEntries: Boolean(
          serviceMap.get(selectedService.serviceId)?.allowMultipleEntries,
        ),
        multipleEntriesLabel: serviceMap.get(selectedService.serviceId)?.multipleEntriesLabel,
          fields: serviceMap.get(selectedService.serviceId)?.formFields ?? [],
      })),
      candidateFormResponses: (item.candidateFormResponses ?? []).map((serviceResponse) => ({
        serviceId: normalizeServiceId(serviceResponse.serviceId),
        serviceName: serviceResponse.serviceName,
        answers: (serviceResponse.answers ?? []).map((answer, answerIndex) => ({
          fieldKey: resolveFieldKey(answer.fieldKey, answer.question, answerIndex),
          question: answer.question,
          fieldType: answer.fieldType,
          required: Boolean(answer.required),
          repeatable: Boolean(answer.repeatable),
          notApplicable: Boolean(answer.notApplicable),
          notApplicableText: answer.notApplicableText ?? "",
          value: answer.value,
          fileName: answer.fileName ?? "",
          fileMimeType: answer.fileMimeType ?? "",
          fileSize: answer.fileSize ?? null,
          fileData: answer.fileData ?? "",
        })),
      })),
      customerRejectedFields: (item.customerRejectedFields ?? []).map((field, fieldIndex) => ({
        serviceId: normalizeServiceId(field.serviceId),
        serviceName: field.serviceName,
        fieldKey: resolveFieldKey(field.fieldKey, field.question, fieldIndex),
        question: field.question,
        fieldType: field.fieldType,
      })),
    };
  });

  return NextResponse.json({ items: enriched });
}

export async function PATCH(req: NextRequest) {
  const auth = await getCandidateAuthFromRequest(req);
  if (!auth || auth.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = submitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid form input." }, { status: 400 });
  }

  await connectMongo();

  const candidate = await User.findById(auth.userId).select("email role").lean();
  if (!candidate || candidate.role !== "candidate") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidateEmail = candidate.email.trim().toLowerCase();

  const requestDoc = await VerificationRequest.findOne({
    _id: parsed.data.requestId,
    ...candidateOwnershipFilter(candidateEmail, auth.userId),
  }).lean();

  if (!requestDoc) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  if (requestDoc.status === "approved" || requestDoc.status === "verified") {
    return NextResponse.json(
      { error: "Approved or verified requests cannot be edited." },
      { status: 400 },
    );
  }

  const selectedServices = (requestDoc.selectedServices ?? []).map((service) => ({
    serviceId: normalizeServiceId(service.serviceId),
    serviceName: service.serviceName,
  }));

  if (selectedServices.length === 0) {
    return NextResponse.json({ error: "No services found for this request." }, { status: 400 });
  }

  const selectedServiceIds = selectedServices.map((service) => service.serviceId);
  const services = await Service.find({ _id: { $in: selectedServiceIds } })
    .select("name allowMultipleEntries multipleEntriesLabel formFields")
    .lean();

  const serviceMap = new Map(
    services.map((service) => [
      String(service._id),
      {
        name: service.name,
        allowMultipleEntries: Boolean(service.allowMultipleEntries),
          multipleEntriesLabel: service.multipleEntriesLabel ?? undefined,
        formFields: (service.formFields ?? []).map((field, index) => ({
          fieldKey: resolveFieldKey(field.fieldKey, field.question, index),
          question: field.question,
          iconKey: normalizeQuestionIconKey(field.iconKey),
          fieldType: field.fieldType,
          required: Boolean(field.required),
          repeatable: field.fieldType === "file" ? false : Boolean(field.repeatable),
          minLength: typeof field.minLength === "number" ? field.minLength : null,
          maxLength: typeof field.maxLength === "number" ? field.maxLength : null,
          forceUppercase: Boolean(field.forceUppercase),
          allowNotApplicable: Boolean(field.allowNotApplicable),
          notApplicableText: field.notApplicableText?.trim() || "Not Applicable",
        })),
      },
    ]),
  );

  const responseMap = new Map(
    parsed.data.responses.map((serviceResponse) => [
      serviceResponse.serviceId,
      (() => {
        const serviceAnswerMap = new Map<
          string,
          {
            value: string;
            repeatable: boolean;
            notApplicable: boolean;
            notApplicableText: string;
            fileName: string;
            fileMimeType: string;
            fileSize: number | null;
            fileData: string;
          }
        >();

        for (const answer of serviceResponse.answers) {
          const normalizedQuestion = answer.question.trim();
          const normalizedFieldKey = answer.fieldKey?.trim() ?? "";
          const payload = {
            value: answer.value?.trim() ?? "",
            repeatable: Boolean(answer.repeatable),
            notApplicable: Boolean(answer.notApplicable),
            notApplicableText: answer.notApplicableText?.trim() ?? "",
            fileName: answer.fileName?.trim() ?? "",
            fileMimeType: answer.fileMimeType?.trim().toLowerCase() ?? "",
            fileSize: answer.fileSize ?? null,
            fileData: answer.fileData?.trim() ?? "",
          };

          if (normalizedFieldKey) {
            serviceAnswerMap.set(`key:${normalizedFieldKey}`, payload);
          }

          serviceAnswerMap.set(`question:${normalizedQuestion}`, payload);
        }

        return serviceAnswerMap;
      })(),
    ]),
  );

  let validationError = "";

  const candidateFormResponses = selectedServices.map((selectedService) => {
    const serviceDefinition = serviceMap.get(selectedService.serviceId);
    const serviceAllowsMultipleEntries = Boolean(serviceDefinition?.allowMultipleEntries);
    const formFields = serviceDefinition?.formFields ?? [];
    const submittedAnswers = responseMap.get(selectedService.serviceId) ?? new Map();

    const answers = formFields.map((field) => {
      const incomingAnswer =
        (field.fieldKey ? submittedAnswers.get(`key:${field.fieldKey}`) : undefined) ??
        submittedAnswers.get(`question:${field.question.trim()}`) ?? {
        value: "",
        repeatable: false,
        notApplicable: false,
        notApplicableText: "",
        fileName: "",
        fileMimeType: "",
        fileSize: null,
        fileData: "",
      };
      const value = incomingAnswer.value ?? "";
      const fileName = incomingAnswer.fileName ?? "";
      const fileMimeType = incomingAnswer.fileMimeType ?? "";
      const fileSize = incomingAnswer.fileSize;
      const fileData = incomingAnswer.fileData ?? "";
      const isRequired = Boolean(field.required);
      const isRepeatable =
        field.fieldType !== "file" &&
        (Boolean(field.repeatable) || serviceAllowsMultipleEntries);
      const allowNotApplicable = Boolean(field.allowNotApplicable);
      const notApplicableText = field.notApplicableText?.trim() || "Not Applicable";
      const isNotApplicable =
        !serviceAllowsMultipleEntries &&
        allowNotApplicable &&
        Boolean(incomingAnswer.notApplicable);
      const hasLengthConstraints = supportsLengthConstraints(field.fieldType);

      const normalizedValue = applyAnswerFormatting(value, field);

      const trimmedValue = normalizedValue.trim();

      if (isNotApplicable) {
        return {
          fieldKey: field.fieldKey,
          question: field.question,
          fieldType: field.fieldType,
          required: isRequired,
          repeatable: false,
          notApplicable: true,
          notApplicableText,
          value: notApplicableText,
          fileName: "",
          fileMimeType: "",
          fileSize: null,
          fileData: "",
        };
      }

      if (field.fieldType === "file") {
        if (isRequired && !fileData && !validationError) {
          validationError = `${field.question} is required.`;
        }

        if (fileData) {
          if (!ALLOWED_UPLOAD_MIME_TYPES.has(fileMimeType) && !validationError) {
            validationError = `${field.question}: only PDF, JPG, and PNG are allowed.`;
          }

          if (
            (typeof fileSize !== "number" ||
              !Number.isFinite(fileSize) ||
              fileSize <= 0 ||
              fileSize > MAX_UPLOAD_SIZE_BYTES) &&
            !validationError
          ) {
            validationError = `${field.question}: file size must be 5MB or less.`;
          }
        }

        return {
          fieldKey: field.fieldKey,
          question: field.question,
          fieldType: field.fieldType,
          required: isRequired,
          repeatable: false,
          notApplicable: false,
          notApplicableText: "",
          value: fileName || value,
          fileName,
          fileMimeType,
          fileSize,
          fileData,
        };
      }

      if (isRepeatable) {
        const parsedValues = parseRepeatableValues(value);
        const normalizedValues = parsedValues
          .map((entry) => applyAnswerFormatting(entry, field).trim())
          .filter(Boolean);
        const isNotApplicableRepeatableEntry = (entry: string) =>
          allowNotApplicable && entry === notApplicableText;

        if (isRequired && normalizedValues.length === 0 && !validationError) {
          validationError = `${field.question} is required.`;
        }

        if (field.fieldType === "number") {
          for (const entry of normalizedValues) {
            if (isNotApplicableRepeatableEntry(entry)) {
              continue;
            }

            const parsedNumber = Number(entry);
            if (Number.isNaN(parsedNumber) && !validationError) {
              validationError = `${field.question} must contain valid numbers.`;
            }
          }
        }

        if (field.fieldType === "date") {
          for (const entry of normalizedValues) {
            if (isNotApplicableRepeatableEntry(entry)) {
              continue;
            }

            const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(entry);
            const dateValue = new Date(`${entry}T00:00:00.000Z`);
            if ((!isIsoDate || Number.isNaN(dateValue.getTime())) && !validationError) {
              validationError = `${field.question} must contain valid dates.`;
            }
          }
        }

        if (hasLengthConstraints) {
          for (const entry of normalizedValues) {
            if (isNotApplicableRepeatableEntry(entry)) {
              continue;
            }

            const comparableLengthValue = resolveLengthComparableValue(entry, field.fieldType);
            const lengthUnit = resolveLengthUnit(field.fieldType);

            if (
              typeof field.minLength === "number" &&
              comparableLengthValue.length < field.minLength &&
              !validationError
            ) {
              validationError = `${field.question} entries must be at least ${field.minLength} ${lengthUnit}.`;
            }

            if (
              typeof field.maxLength === "number" &&
              comparableLengthValue.length > field.maxLength &&
              !validationError
            ) {
              validationError = `${field.question} entries must be ${field.maxLength} ${lengthUnit} or fewer.`;
            }
          }
        }

        const hasNotApplicableEntries = normalizedValues.some((entry) =>
          isNotApplicableRepeatableEntry(entry),
        );
        const allNotApplicable =
          hasNotApplicableEntries &&
          normalizedValues.every((entry) => isNotApplicableRepeatableEntry(entry));

        return {
          fieldKey: field.fieldKey,
          question: field.question,
          fieldType: field.fieldType,
          required: isRequired,
          repeatable: true,
          notApplicable: allNotApplicable,
          notApplicableText: hasNotApplicableEntries ? notApplicableText : "",
          value: JSON.stringify(normalizedValues),
          fileName: "",
          fileMimeType: "",
          fileSize: null,
          fileData: "",
        };
      }

      if (isRequired && !trimmedValue && !validationError) {
        validationError = `${field.question} is required.`;
      }

      if (field.fieldType === "number" && trimmedValue) {
        const parsedNumber = Number(trimmedValue);
        if (Number.isNaN(parsedNumber) && !validationError) {
          validationError = `${field.question} must be a valid number.`;
        }
      }

      if (field.fieldType === "date" && trimmedValue) {
        const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue);
        const dateValue = new Date(`${trimmedValue}T00:00:00.000Z`);
        if ((!isIsoDate || Number.isNaN(dateValue.getTime())) && !validationError) {
          validationError = `${field.question} must be a valid date.`;
        }
      }

      if (hasLengthConstraints && trimmedValue) {
        const comparableLengthValue = resolveLengthComparableValue(trimmedValue, field.fieldType);
        const lengthUnit = resolveLengthUnit(field.fieldType);

        if (
          typeof field.minLength === "number" &&
          comparableLengthValue.length < field.minLength &&
          !validationError
        ) {
          validationError = `${field.question} must be at least ${field.minLength} ${lengthUnit}.`;
        }

        if (
          typeof field.maxLength === "number" &&
          comparableLengthValue.length > field.maxLength &&
          !validationError
        ) {
          validationError = `${field.question} must be ${field.maxLength} ${lengthUnit} or fewer.`;
        }
      }

      return {
        fieldKey: field.fieldKey,
        question: field.question,
        fieldType: field.fieldType,
        required: isRequired,
        repeatable: false,
        notApplicable: false,
        notApplicableText: "",
        value: normalizedValue,
        fileName: "",
        fileMimeType: "",
        fileSize: null,
        fileData: "",
      };
    });

    return {
      serviceId: selectedService.serviceId,
      serviceName: selectedService.serviceName,
      answers,
    };
  });

  if (validationError) {
    return NextResponse.json(
      { error: validationError },
      { status: 400 },
    );
  }

  await VerificationRequest.findByIdAndUpdate(parsed.data.requestId, {
    candidateUser: auth.userId,
    candidateEmail,
    candidateFormResponses,
    customerRejectedFields: [],
    candidateFormStatus: "submitted",
    candidateSubmittedAt: new Date(),
    status: "pending",
    rejectionNote: "",
  });

  return NextResponse.json({ message: "Form submitted. Your request is now in admin review queue." });
}
