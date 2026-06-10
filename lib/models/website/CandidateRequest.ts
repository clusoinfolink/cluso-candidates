import { Schema, Model } from "mongoose";
import { connectWebsiteDb } from "@/lib/websiteDb";

/**
 * CandidateRequest schema matching the ClusoWebsite database model.
 * This is a read-only model used to fetch job applications that candidates
 * submitted via cluso.in so we can display them on the candidates portal.
 */

interface ICandidateRequest {
  _id: string;
  name: string;
  email: string;
  phone: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobId?: any;
  jobTitle?: string;
  jobColor?: string;
  jobDescription?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resumeDocumentId: any;
  resumeFileName: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CandidateRequestSchema = new Schema<ICandidateRequest>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    jobId: { type: Schema.Types.ObjectId },
    jobTitle: { type: String },
    jobColor: { type: String },
    jobDescription: { type: String },
    resumeDocumentId: { type: Schema.Types.ObjectId },
    resumeFileName: { type: String },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

let cachedModel: Model<ICandidateRequest> | null = null;

/**
 * Returns the CandidateRequest model bound to the ClusoWebsite DB connection.
 * The model is cached after the first call.
 */
export async function getWebsiteCandidateRequestModel(): Promise<Model<ICandidateRequest>> {
  if (cachedModel) {
    return cachedModel;
  }

  const connection = await connectWebsiteDb();

  // Use existing model on this connection if available, otherwise create it
  cachedModel =
    connection.models.CandidateRequest ||
    connection.model<ICandidateRequest>("CandidateRequest", CandidateRequestSchema);

  return cachedModel;
}

export type { ICandidateRequest };
