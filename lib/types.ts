export type PortalRole = "candidate";

export type ServiceOption = {
  serviceId: string;
  serviceName: string;
  price: number;
  currency: "INR" | "USD";
};

export type ServiceFormField = {
  question: string;
  fieldType: "text" | "long_text" | "number" | "file";
  required: boolean;
};

export type CandidateAnswer = {
  question: string;
  fieldType: "text" | "long_text" | "number" | "file";
  required?: boolean;
  value: string;
  fileName?: string;
  fileMimeType?: string;
  fileSize?: number | null;
  fileData?: string;
};

export type CandidateServiceResponse = {
  serviceId: string;
  serviceName: string;
  answers: CandidateAnswer[];
};

export type RejectedCandidateField = {
  serviceId: string;
  serviceName: string;
  question: string;
  fieldType: "text" | "long_text" | "number" | "file";
};

export type PortalUser = {
  id: string;
  name: string;
  email: string;
  role: PortalRole;
};

export type MeResponse = {
  user: PortalUser;
};

export type RequestStatus = "pending" | "approved" | "rejected";

export type RequestItem = {
  _id: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  customerName: string;
  customerEmail: string;
  status: RequestStatus;
  candidateFormStatus: "pending" | "submitted";
  candidateSubmittedAt?: string | null;
  rejectionNote: string;
  createdAt: string;
  updatedAt?: string;
  selectedServices: ServiceOption[];
  serviceForms: Array<{
    serviceId: string;
    serviceName: string;
    fields: ServiceFormField[];
  }>;
  candidateFormResponses: CandidateServiceResponse[];
  customerRejectedFields?: RejectedCandidateField[];
};
