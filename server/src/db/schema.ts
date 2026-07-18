import {
  pgTable, text, timestamp, integer, boolean, jsonb, uuid, pgEnum, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const roleEnum = pgEnum('role', ['admin', 'gerente']);
export const userStatusEnum = pgEnum('user_status', ['invited', 'active', 'disabled']);
export const packStatusEnum = pgEnum('pack_status', ['draft', 'published', 'archived']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('gerente'),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  status: userStatusEnum('status').notNull().default('invited'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  role: roleEnum('role').notNull().default('gerente'),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  invitedBy: uuid('invited_by').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const packs = pgTable('packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  coverKey: text('cover_key'),
  authorName: text('author_name').notNull(),
  status: packStatusEnum('status').notNull().default('draft'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  packId: uuid('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// id é text e chave primária: é o mesmo identificador gravado nos favoritos do
// app iOS, então precisa ser único no sistema inteiro, não por pacote.
export const stickers = pgTable('stickers', {
  id: text('id').primaryKey(),
  packId: uuid('pack_id').notNull().references(() => packs.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  fileKey: text('file_key').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  checksum: text('checksum').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const catalogVersions = pgTable('catalog_versions', {
  version: integer('version').primaryKey(),
  manifestKey: text('manifest_key').notNull(),
  checksum: text('checksum').notNull(),
  publishedBy: uuid('published_by').notNull().references(() => users.id),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  isCurrent: boolean('is_current').notNull().default(false),
}, (t) => [
  uniqueIndex('catalog_only_one_current').on(t.isCurrent).where(sql`${t.isCurrent} = true`),
]);

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
