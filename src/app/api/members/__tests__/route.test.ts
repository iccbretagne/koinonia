import { describe, it, expect, vi, beforeEach } from "vitest";
import { prismaMock } from "@/__mocks__/prisma";
import { createAdminSession } from "@/__mocks__/auth";

// Mock auth before importing route handlers
const mockRequireChurchPermission = vi.fn();
const mockResolveChurchId = vi.fn().mockResolvedValue("church-1");
vi.mock("@/lib/auth", () => ({
  requireChurchPermission: (...args: unknown[]) => mockRequireChurchPermission(...args),
  resolveChurchId: (...args: unknown[]) => mockResolveChurchId(...args),
}));

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

// Import handlers after mocks
const { POST } = await import("../route");

describe("POST /api/members", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireChurchPermission.mockResolvedValue(createAdminSession());
    mockResolveChurchId.mockResolvedValue("church-1");
    prismaMock.member.findMany.mockResolvedValue([]);
  });

  it("creates a member with email when no duplicate exists", async () => {
    prismaMock.member.create.mockResolvedValue({
      id: "member-new",
      firstName: "Jean",
      lastName: "Dupont",
      email: "jean.dupont@example.com",
      departments: [],
    });

    const request = new Request("http://localhost/api/members", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean.dupont@example.com",
        departmentId: "dept-1",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("jean.dupont@example.com");
    expect(prismaMock.member.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "jean.dupont@example.com" }),
      })
    );
  });

  it("returns 409 with duplicates when email already exists in the church", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      { id: "member-existing", firstName: "Jean", lastName: "Dupont", email: "jean.dupont@example.com" },
    ]);

    const request = new Request("http://localhost/api/members", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean.dupont@example.com",
        departmentId: "dept-1",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.duplicates).toHaveLength(1);
    expect(body.duplicates[0].id).toBe("member-existing");
    expect(prismaMock.member.create).not.toHaveBeenCalled();
  });

  it("returns 409 with duplicates when the normalized name already exists", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      { id: "member-existing", firstName: "Jérémie", lastName: "Dupont", email: null },
    ]);

    const request = new Request("http://localhost/api/members", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Jeremie",
        lastName: "dupont",
        departmentId: "dept-1",
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.duplicates).toHaveLength(1);
  });

  it("creates the member despite a duplicate when confirmDuplicate is true", async () => {
    prismaMock.member.findMany.mockResolvedValue([
      { id: "member-existing", firstName: "Jean", lastName: "Dupont", email: "jean.dupont@example.com" },
    ]);
    prismaMock.member.create.mockResolvedValue({
      id: "member-new",
      firstName: "Jean",
      lastName: "Dupont",
      email: "jean.dupont@example.com",
      departments: [],
    });

    const request = new Request("http://localhost/api/members", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Jean",
        lastName: "Dupont",
        email: "jean.dupont@example.com",
        departmentId: "dept-1",
        confirmDuplicate: true,
      }),
    });
    const res = await POST(request);

    expect(res.status).toBe(201);
    expect(prismaMock.member.create).toHaveBeenCalled();
  });
});
