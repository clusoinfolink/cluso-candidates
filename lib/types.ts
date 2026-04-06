export type PortalRole = "candidate";

export type ServiceOption = {
  serviceId: string;
  serviceName: string;
  price: number;
  currency: "INR" | "USD";
};

export type ServiceFormField = {
  fieldKey?: string;
  question: string;
  iconKey?: string;
  fieldType: "text" | "long_text" | "number" | "file" | "date";
  required: boolean;
  repeatable?: boolean;
  minLength?: number | null;
  maxLength?: number | null;
  forceUppercase?: boolean;
  allowNotApplicable?: boolean;
  notApplicableText?: string;
};

export type CandidateAnswer = {
  fieldKey?: string;
  question: string;
  fieldType: "text" | "long_text" | "number" | "file" | "date";
  required?: boolean;
  repeatable?: boolean;
  notApplicable?: boolean;
  notApplicableText?: string;
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
  fieldKey?: string;
  question: string;
  fieldType: "text" | "long_text" | "number" | "file" | "date";
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

export type RequestStatus = "pending" | "approved" | "rejected" | "verified";

export type ServiceVerificationStatus = "pending" | "verified" | "unverified";

export type ServiceVerificationAttempt = {
  status: Exclude<ServiceVerificationStatus, "pending">;
  verificationMode: string;
  comment: string;
  attemptedAt: string;
  verifierId?: string | null;
  verifierName?: string;
  managerId?: string | null;
  managerName?: string;
};

export type ServiceVerification = {
  serviceId: string;
  serviceName: string;
  status: ServiceVerificationStatus;
  verificationMode: string;
  comment: string;
  attempts: ServiceVerificationAttempt[];
};

export type ReportMetadata = {
  generatedAt?: string | null;
  generatedBy?: string | null;
  generatedByName?: string;
  reportNumber?: string;
};

export type InvoiceSnapshot = {
  currency: "INR" | "USD";
  subtotal: number;
  items: Array<{
    serviceId: string;
    serviceName: string;
    price: number;
  }>;
  billingEmail?: string;
  companyName?: string;
};

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
  enterpriseApprovedAt?: string | null;
  enterpriseDecisionLockedAt?: string | null;
  rejectionNote: string;
  createdAt: string;
  updatedAt?: string;
  selectedServices: ServiceOption[];
  serviceVerifications?: ServiceVerification[];
  reportMetadata?: ReportMetadata;
  reportData?: Record<string, unknown> | null;
  invoiceSnapshot?: InvoiceSnapshot | null;
  serviceForms: Array<{
    serviceId: string;
    serviceName: string;
    allowMultipleEntries?: boolean;
  multipleEntriesLabel?: string;
    fields: ServiceFormField[];
  }>;
  candidateFormResponses: CandidateServiceResponse[];
  customerRejectedFields?: RejectedCandidateField[];
};
