import Joi from "joi";
import { EMPLOYMENT_TYPES } from "../models/jobOpening.js";
import { APPLICATION_STATUSES } from "../models/jobApplication.js";

const listItem = Joi.string().trim().max(300);

export const jobSchema = Joi.object({
  title: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().trim().allow("").max(3000).default(""),
  responsibilities: Joi.array().items(listItem).max(20).default([]),
  requirements: Joi.array().items(listItem).max(20).default([]),
  location: Joi.string().trim().min(2).max(120).required(),
  employmentType: Joi.string().valid(...EMPLOYMENT_TYPES).required(),
  salary: Joi.string().trim().allow("").max(80).default(""),
  openings: Joi.number().integer().min(0).max(10000).allow(null).default(null),
  isActive: Joi.boolean().default(true),
  sortOrder: Joi.number().integer().min(0).max(10000).default(0),
});

export const jobActiveSchema = Joi.object({ isActive: Joi.boolean().required() });

// Multipart form fields arrive as strings; Joi converts numbers
export const applicationSchema = Joi.object({
  jobId: Joi.string().hex().length(24).required().messages({ "any.required": "Choose a job role" }),
  fullName: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .pattern(/^[\p{L} .'-]+$/u)
    .required()
    .messages({ "string.pattern.base": "Full name can only contain letters, spaces, dots and hyphens" }),
  phone: Joi.string().trim().min(10).max(16).required(),
  email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).allow("").max(120).default(""),
  city: Joi.string().trim().min(2).max(100).required(),
  address: Joi.string().trim().allow("").max(500).default(""),
  experienceType: Joi.string().valid("fresher", "experienced").required(),
  experienceYears: Joi.when("experienceType", {
    is: "experienced",
    then: Joi.number().min(0.5).max(50).required().messages({ "any.required": "Enter your years of experience" }),
    otherwise: Joi.any().strip(),
  }),
  message: Joi.string().trim().allow("").max(1000).default(""),
  // Honeypot: real people never fill this hidden field
  website: Joi.string().allow("").max(200).default(""),
});

export const listApplicationsQuerySchema = Joi.object({
  jobId: Joi.string().allow("").default(""),
  status: Joi.string().valid("", ...APPLICATION_STATUSES).default(""),
  location: Joi.string().trim().allow("").max(100).default(""),
  search: Joi.string().trim().allow("").max(100).default(""),
  from: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow("").default(""),
  to: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).allow("").default(""),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const statusSchema = Joi.object({
  status: Joi.string().valid(...APPLICATION_STATUSES).required(),
  interviewAt: Joi.date().iso().allow(null).default(null),
  notify: Joi.boolean().default(true),
});

export const noteSchema = Joi.object({
  text: Joi.string().trim().min(1).max(2000).required(),
});

export const publicJobsQuerySchema = Joi.object({
  search: Joi.string().trim().allow("").max(100).default(""),
  location: Joi.string().trim().allow("").max(100).default(""),
});
