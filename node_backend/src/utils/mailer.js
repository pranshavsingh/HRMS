import nodemailer from "nodemailer";
import { config } from "../config/env.js";

const transporter = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpSecure,
  auth: {
    user: config.smtpUser,
    pass: config.smtpPass,
  },
});

export async function sendOtpEmail(to, otp) {
  const from = config.mailFrom || config.smtpUser;
  if (!from) throw new Error("MAIL_FROM/SMTP_USER is not configured");

  await transporter.sendMail({
    from,
    to,
    subject: "HRMS Password Reset OTP",
    text: `Your OTP is ${otp}. It expires in ${config.otpExpiryMinutes} minutes.`,
    html: `<p>Your OTP is <b>${otp}</b>.</p><p>It expires in ${config.otpExpiryMinutes} minutes.</p>`,
  });
}