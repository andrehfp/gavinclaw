import { insertAuditEvent, type AuditWriteInput } from '@/lib/server/audit/postgres';

export async function appendAuditEvent(input: AuditWriteInput): Promise<string> {
  return insertAuditEvent(input);
}
