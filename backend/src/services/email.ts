import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: false,
  auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
});

async function send(to: string, subject: string, html: string) {
  if (!config.smtp.user) {
    logger.warn('SMTP not configured, skipping email', { to, subject });
    return;
  }
  await transporter.sendMail({ from: config.smtp.from, to, subject, html });
}

export async function sendDeadlineReminder(to: string, name: string, hoursLeft: number) {
  await send(to, `⏰ ${hoursLeft}h left to submit predictions — WC2026 Predictions`, `
    <h2>Hi ${name},</h2>
    <p>You have <strong>${hoursLeft} hours</strong> left to submit your pre-tournament predictions!</p>
    <p><a href="${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/predict">Submit now →</a></p>
  `);
}
