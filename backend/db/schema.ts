import { sqliteTable, integer, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const visitors = sqliteTable('visitors', {
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  id: text('id').notNull(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
  visitorKey: text('visitor_key').notNull(),
  hidden: integer('hidden').notNull().default(0),
}, table => [
  uniqueIndex('idx_visitors_id').on(table.id),
  uniqueIndex('idx_visitors_visitor_key').on(table.visitorKey),
]);

export const submissionLimits = sqliteTable('submission_limits', {
  key: text('key').primaryKey(),
  attempts: integer('attempts').notNull(),
  expiresAt: integer('expires_at').notNull(),
}, table => [index('idx_submission_limits_expires_at').on(table.expiresAt)]);
