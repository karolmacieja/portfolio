import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

// Outside Next there is no incremental cache: resolve hosts straight from the database.
vi.mock("next/cache", () => ({ unstable_cache: (fn: () => unknown) => fn }));

// Integration: contact form submission rules and the owner-scoped inbox (database, Redis, mock mailer).
describe.skipIf(!process.env.DATABASE_URL || !process.env.REDIS_URL)(
  "contact messages (database)",
  async () => {
    const { db } = await import("@/lib/db");
    const contact = await import("./service");
    const { purgeContactMessages } = await import("./retention");
    const run = randomUUID().slice(0, 8);
    const userIds: string[] = [];
    const formContent = { content: [{ type: "ContactForm", props: { id: "c1", heading: "Hi" } }], root: {} };

    async function createSite(content: unknown = formContent) {
      const user = await db.user.create({
        data: { email: `ct-${randomUUID().slice(0, 8)}-${run}@test.local` },
      });
      userIds.push(user.id);
      const slug = `t-ct-${randomUUID().slice(0, 8)}`;
      const site = await db.site.create({
        data: { ownerId: user.id, name: "Contact", slug, publishedAt: new Date() },
      });
      await db.page.create({
        data: {
          siteId: site.id,
          path: "",
          title: "Home",
          draftContent: content as object,
          publishedContent: content as object,
          publishedAt: new Date(),
        },
      });
      return { user, site, host: `${slug}.localhost` };
    }
    const submit = (
      host: string,
      overrides: Partial<Parameters<typeof contact.submitContactMessage>[0]> = {},
    ) =>
      contact.submitContactMessage({
        host,
        path: "",
        name: "Anna",
        email: "anna@example.com",
        message: "Hello, I like your work!",
        ip: `198.51.100.${Math.floor(Math.random() * 250)}-${randomUUID()}`,
        ...overrides,
      });

    afterAll(async () => {
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    });

    it("stores a message for a published page with a contact form", async () => {
      const { site, host, user } = await createSite();
      expect(await submit(host)).toBe("sent");
      const [message] = await contact.listContactMessages(user.id);
      expect(message).toMatchObject({ siteId: site.id, name: "Anna", readAt: null });
      expect(message?.senderHash).toHaveLength(32);
      expect(await contact.countUnreadMessages(user.id)).toBe(1);
    });

    it("refuses pages without a form, invalid input and link spam", async () => {
      const { host } = await createSite({
        content: [{ type: "Text", props: { id: "t", text: "x" } }],
        root: {},
      });
      expect(await submit(host)).toBe("notAccepted");
      const withForm = await createSite();
      expect(await submit(withForm.host, { email: "nope" })).toBe("invalid");
      expect(await submit(withForm.host, { message: "http://a http://b http://c http://d" })).toBe("invalid");
      expect(await submit(withForm.host, { path: "missing" })).toBe("notAccepted");
    });

    it("rate limits one sender", async () => {
      const { host } = await createSite();
      const ip = `203.0.113.${run}`;
      const results = [];
      for (let i = 0; i < 6; i++) results.push(await submit(host, { ip }));
      expect(results.slice(0, 5).every((r) => r === "sent")).toBe(true);
      expect(results[5]).toBe("rateLimited");
    });

    it("keeps the inbox owner-scoped", async () => {
      const owner = await createSite();
      const stranger = await createSite();
      await submit(owner.host);
      const [message] = await contact.listContactMessages(owner.user.id);
      expect(await contact.listContactMessages(stranger.user.id)).toHaveLength(0);
      expect(await contact.setMessageRead(stranger.user.id, message!.id, true)).toBe(false);
      expect(await contact.deleteContactMessage(stranger.user.id, message!.id)).toBe(false);
      expect(await contact.setMessageRead(owner.user.id, message!.id, true)).toBe(true);
      expect(await contact.deleteContactMessage(owner.user.id, message!.id)).toBe(true);
    });

    it("deletes messages older than the retention period", async () => {
      const { site } = await createSite();
      const old = await db.contactMessage.create({
        data: {
          siteId: site.id,
          path: "",
          name: "Old",
          email: "o@example.com",
          message: "x",
          senderHash: "h",
        },
      });
      await db.contactMessage.update({
        where: { id: old.id },
        data: { createdAt: new Date(Date.now() - 800 * 86_400_000) },
      });
      await purgeContactMessages();
      expect(await db.contactMessage.count({ where: { id: old.id } })).toBe(0);
    });
  },
);
