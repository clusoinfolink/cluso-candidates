import { InferSchemaType, Model, Schema, models, model } from "mongoose";
import { SUPPORTED_CURRENCIES } from "@/lib/currencies";

const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["superadmin", "admin", "customer", "delegate", "delegate_user", "candidate"],
      required: true,
    },
    parentCustomer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdByDelegate: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    mustChangePassword: {
      type: Boolean,
      default: undefined,
    },
    candidateProfile: {
      keySkills: {
        type: [String],
        default: [],
      },
      employment: {
        type: [
          {
            companyName: { type: String, default: "", trim: true },
            designation: { type: String, default: "", trim: true },
            city: { type: String, default: "", trim: true },
            state: { type: String, default: "", trim: true },
            country: { type: String, default: "", trim: true },
            startDate: { type: String, default: "", trim: true },
            endDate: { type: String, default: "", trim: true },
            currentlyWorking: { type: Boolean, default: false },
            employmentType: { type: String, default: "", trim: true },
            description: { type: String, default: "", trim: true },
          },
        ],
        default: [],
      },
      education: {
        type: [
          {
            level: { type: String, default: "", trim: true },
            institution: { type: String, default: "", trim: true },
            degree: { type: String, default: "", trim: true },
            fieldOfStudy: { type: String, default: "", trim: true },
            city: { type: String, default: "", trim: true },
            state: { type: String, default: "", trim: true },
            country: { type: String, default: "", trim: true },
            startYear: { type: String, default: "", trim: true },
            endYear: { type: String, default: "", trim: true },
            educationType: { type: String, default: "", trim: true },
            grade: { type: String, default: "", trim: true },
          },
        ],
        default: [],
      },
    },
    selectedServices: [
      {
        serviceId: {
          type: Schema.Types.ObjectId,
          ref: "Service",
          required: true,
        },
        serviceName: { type: String, required: true },
        price: { type: Number, required: true },
        currency: { type: String, enum: SUPPORTED_CURRENCIES, default: "INR" },
        countryRates: [
          {
            country: { type: String, required: true, trim: true },
            price: { type: Number, required: true, min: 0 },
            currency: { type: String, enum: SUPPORTED_CURRENCIES, required: true },
          },
        ],
      },
    ],
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof UserSchema> & { _id: string };

const existingUserRoleValues = models.User?.schema.path("role")?.options?.enum;
const hasDelegateUserRole =
  Array.isArray(existingUserRoleValues) && existingUserRoleValues.includes("delegate_user");
const hasCandidateRole =
  Array.isArray(existingUserRoleValues) && existingUserRoleValues.includes("candidate");
const hasCreatedByDelegatePath = Boolean(models.User?.schema.path("createdByDelegate"));
const hasMustChangePasswordPath = Boolean(models.User?.schema.path("mustChangePassword"));
const hasCandidateProfilePath = Boolean(models.User?.schema.path("candidateProfile"));
const hasCountryRatesPath = Boolean(models.User?.schema.path("selectedServices.countryRates"));

if (
  models.User &&
  (!models.User.schema.path("selectedServices") ||
    !hasDelegateUserRole ||
    !hasCandidateRole ||
    !hasCreatedByDelegatePath ||
    !hasMustChangePasswordPath ||
    !hasCandidateProfilePath ||
    !hasCountryRatesPath)
) {
  delete models.User;
}

const User = (models.User as Model<UserDocument>) || model("User", UserSchema);

export default User;
