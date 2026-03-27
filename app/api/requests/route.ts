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
          fileName: z.string().optional().default(""),
          fileMimeType: z.string().optional().default(""),
          fileSize: z.number().nullable().optional().default(null),
          fileData: z.string().optional().default(""),
        }),
      ),
    }),
  ),
});

function normalizeServiceId(serviceId: unknown) {
  return String(serviceId);
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

  const candidateEmail = candidate.email.toLowerCase();

  const items = await VerificationRequest.find({
    $or: [{ candidateUser: auth.userId }, { candidateEmail }],
  })
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
          value: answer.value,
          fileName: answer.fileName ?? "",
          fileMimeType: answer.fileMimeType ?? "",
          fileSize: answer.fileSize ?? null,
          fileData: answer.fileData ?? "",
        })),
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

  const candidateEmail = candidate.email.toLowerCase();

  const requestDoc = await VerificationRequest.findOne({
    _id: parsed.data.requestId,
    $or: [{ candidateUser: auth.userId }, { candidateEmail }],
  }).lean();

  if (!requestDoc) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  if (requestDoc.status === "approved") {
    return NextResponse.json({ error: "Approved requests cannot be edited." }, { status: 400 });
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
          value: fileName || value,
          fileName,
          fileMimeType,
          fileSize,
          fileData,
        };
      }

      if (isRequired && !value.trim() && !validationError) {
        validationError = `${field.question} is required.`;
      }

      if (field.fieldType === "number" && value.trim()) {
        const parsedNumber = Number(value);
        if (Number.isNaN(parsedNumber) && !validationError) {
          validationError = `${field.question} must be a valid number.`;
        }
      }

      return {
        question: field.question,
        fieldType: field.fieldType,
        required: isRequired,
        value,
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
    candidateFormStatus: "submitted",
    candidateSubmittedAt: new Date(),
    status: "pending",
    rejectionNote: "",
  });

  return NextResponse.json({ message: "Form submitted. Your request is now in admin review queue." });
}
