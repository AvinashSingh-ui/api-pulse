import nodemailer, { type Transporter, type TestAccount } from 'nodemailer';
import { config } from '../config/index.js';

class MailService {
  private transporter: Transporter | null = null;
  private isEthereal = false;

  private async getTransporter(): Promise<Transporter> {
    if (this.transporter) {
      return this.transporter;
    }

    // 1. If real SMTP credentials are provided, use them directly
    if (config.smtp.user && config.smtp.pass) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure || config.smtp.port === 465,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass,
        },
      });
      console.log(`[MailService] Configured live SMTP transport via ${config.smtp.host}:${config.smtp.port} (${config.smtp.user})`);
      return this.transporter;
    }

    // 2. Otherwise create Ethereal live test SMTP account (delivers real emails to an accessible online test inbox)
    try {
      const testAccount = await nodemailer.createTestAccount();
      this.isEthereal = true;
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      console.log(`[MailService] Created Ethereal SMTP mail delivery account: ${testAccount.user}`);
      return this.transporter;
    } catch (err) {
      console.warn('[MailService] Failed to create Ethereal account, using JSON transport fallback:', err);
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      });
      return this.transporter;
    }
  }

  public async sendOtpEmail(toEmail: string, otp: string, providerName = 'API Pulse'): Promise<{ success: boolean; previewUrl?: string }> {
    try {
      const transporter = await this.getTransporter();
      const from = config.smtp.from || 'API Pulse <no-reply@apipulse.io>';

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #09090b; margin: 0; padding: 32px 16px; color: #f4f4f5; }
    .card { max-width: 480px; margin: 0 auto; background: #121215; border-radius: 14px; border: 1px solid #27272a; padding: 40px 32px; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5); }
    .logo { font-size: 20px; font-weight: 800; color: #f4f4f5; margin-bottom: 24px; letter-spacing: -0.02em; }
    .title { font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
    .text { font-size: 14px; color: #a1a1aa; line-height: 1.6; margin-bottom: 24px; }
    .otp-box { background: #18181b; border: 1px solid #3f3f46; border-radius: 10px; padding: 18px 24px; text-align: center; font-size: 34px; font-weight: 800; letter-spacing: 0.25em; color: #ffffff; margin-bottom: 24px; font-family: 'SF Mono', Monaco, Menlo, Consolas, monospace; }
    .footer { font-size: 12px; color: #71717a; line-height: 1.5; border-top: 1px solid #27272a; padding-top: 20px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚡ API Pulse Observability</div>
    <div class="title">Your One-Time Passcode (OTP)</div>
    <div class="text">
      You requested an authentication code to sign in to API Pulse via <strong>${providerName}</strong>. Use the 6-digit verification code below to verify your identity:
    </div>
    <div class="otp-box">${otp}</div>
    <div class="text">
      This verification code is valid for <strong>10 minutes</strong>. If you did not request this code, no action is required and you can safely ignore this email.
    </div>
    <div class="footer">
      API Pulse Security & Observability Platform &bull; Automated Identity Verification
    </div>
  </div>
</body>
</html>
      `;

      const info = await transporter.sendMail({
        from,
        to: toEmail,
        subject: `${otp} is your API Pulse verification code`,
        text: `Your API Pulse verification code is: ${otp}. Valid for 10 minutes.`,
        html: htmlContent,
      });

      console.log(`[MailService] Verification email dispatched to ${toEmail}: ${info.messageId}`);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`[MailService] Live email inbox preview: ${previewUrl}`);
      }

      return {
        success: true,
        previewUrl: typeof previewUrl === 'string' ? previewUrl : undefined,
      };
    } catch (error) {
      console.error(`[MailService] Failed to send verification email to ${toEmail}:`, error);
      return { success: false };
    }
  }
}

export const mailService = new MailService();
