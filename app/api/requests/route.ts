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

const submitSchema = z.object({
  requestId: z.string().min(1),
  responses: z.array(
    z.object({
      serviceId: z.string().min(1),
      answers: z.array(
        z.object({
          question: z.string().min(1),
          value: z.string().optional().default(""),
          repeatable: z.boolean().optional().default(false),
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
  return fieldType === "text" || fieldType === "long_text";
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
    supportsLengthConstraints(field.fieldType) &&
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
          .select("name formFields")
          .lean()
      : [];

  const serviceMap = new Map(
    services.map((service) => [
      String(service._id),
      {
        name: service.name,
        formFields: (service.formFields ?? []).map((field) => ({
          question: field.question,
          fieldType: field.fieldType,
          required: Boolean(field.required),
          repeatable: field.fieldType === "file" ? false : Boolean(field.repeatable),
          minLength: typeof field.minLength === "number" ? field.minLength : null,
          maxLength: typeof field.maxLength === "number" ? field.maxLength : null,
          forceUppercase: Boolean(field.forceUppercase),
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
        fields: serviceMap.get(selectedService.serviceId)?.formFields ?? [],
      })),
      candidateFormResponses: (item.candidateFormResponses ?? []).map((serviceResponse) => ({
        serviceId: normalizeServiceId(serviceResponse.serviceId),
        serviceName: serviceResponse.serviceName,
        answers: (serviceResponse.answers ?? []).map((answer) => ({
          question: answer.question,
          fieldType: answer.fieldType,
          required: Boolean(answer.required),
          repeatable: Boolean(answer.repeatable),
          value: answer.value,
          fileName: answer.fileName ?? "",
          fileMimeType: answer.fileMimeType ?? "",
          fileSize: answer.fileSize ?? null,
          fileData: answer.fileData ?? "",
        })),
      })),
      customerRejectedFields: (item.customerRejectedFields ?? []).map((field) => ({
        serviceId: normalizeServiceId(field.serviceId),
        serviceName: field.serviceName,
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
    .select("name formFields")
    .lean();

  const serviceMap = new Map(
    services.map((service) => [
      String(service._id),
      {
        name: service.name,
        formFields: (service.formFields ?? []).map((field) => ({
          question: field.question,
          fieldType: field.fieldType,
          required: Boolean(field.required),
          repeatable: field.fieldType === "file" ? false : Boolean(field.repeatable),
          minLength: typeof field.minLength === "number" ? field.minLength : null,
          maxLength: typeof field.maxLength === "number" ? field.maxLength : null,
          forceUppercase: Boolean(field.forceUppercase),
        })),
      },
    ]),
  );

  const responseMap = new Map(
    parsed.data.responses.map((serviceResponse) => [
      serviceResponse.serviceId,
      new Map(
        serviceResponse.answers.map((answer) => [
          answer.question.trim(),
          {
            value: answer.value?.trim() ?? "",
            repeatable: Boolean(answer.repeatable),
            fileName: answer.fileName?.trim() ?? "",
            fileMimeType: answer.fileMimeType?.trim().toLowerCase() ?? "",
            fileSize: answer.fileSize ?? null,
            fileData: answer.fileData?.trim() ?? "",
          },
        ]),
      ),
    ]),
  );

  let validationError = "";

  const candidateFormResponses = selectedServices.map((selectedService) => {
    const serviceDefinition = serviceMap.get(selectedService.serviceId);
    const formFields = serviceDefinition?.formFields ?? [];
    const submittedAnswers = responseMap.get(selectedService.serviceId) ?? new Map();

    const answers = formFields.map((field) => {
      const incomingAnswer = submittedAnswers.get(field.question) ?? {
        value: "",
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
      const isRepeatable = field.fieldType !== "file" && Boolean(field.repeatable);
      const hasLengthConstraints = supportsLengthConstraints(field.fieldType);

      let normalizedValue = applyAnswerFormatting(value, field);

      const trimmedValue = normalizedValue.trim();

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
          question: field.question,
          fieldType: field.fieldType,
          required: isRequired,
          repeatable: false,
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

        if (isRequired && normalizedValues.length === 0 && !validationError) {
          validationError = `${field.question} is required.`;
        }

        if (field.fieldType === "number") {
          for (const entry of normalizedValues) {
            const parsedNumber = Number(entry);
            if (Number.isNaN(parsedNumber) && !validationError) {
              validationError = `${field.question} must contain valid numbers.`;
            }
          }
        }

        if (field.fieldType === "date") {
          for (const entry of normalizedValues) {
            const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(entry);
            const dateValue = new Date(`${entry}T00:00:00.000Z`);
            if ((!isIsoDate || Number.isNaN(dateValue.getTime())) && !validationError) {
              validationError = `${field.question} must contain valid dates.`;
            }
          }
        }

        if (hasLengthConstraints) {
          for (const entry of normalizedValues) {
            if (
              typeof field.minLength === "number" &&
              entry.length < field.minLength &&
              !validationError
            ) {
              validationError = `${field.question} entries must be at least ${field.minLength} characters.`;
            }

            if (
              typeof field.maxLength === "number" &&
              entry.length > field.maxLength &&
              !validationError
            ) {
              validationError = `${field.question} entries must be ${field.maxLength} characters or fewer.`;
            }
          }
        }

        return {
          question: field.question,
          fieldType: field.fieldType,
          required: isRequired,
          repeatable: true,
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
        if (
          typeof field.minLength === "number" &&
          trimmedValue.length < field.minLength &&
          !validationError
        ) {
          validationError = `${field.question} must be at least ${field.minLength} characters.`;
        }

        if (
          typeof field.maxLength === "number" &&
          trimmedValue.length > field.maxLength &&
          !validationError
        ) {
          validationError = `${field.question} must be ${field.maxLength} characters or fewer.`;
        }
      }

      return {
        question: field.question,
        fieldType: field.fieldType,
        required: isRequired,
        repeatable: false,
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
