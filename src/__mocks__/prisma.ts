import { vi } from "vitest";

// Deep mock factory for Prisma models
function createModelMock() {
  return {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  };
}

export const prismaMock = {
  church: createModelMock(),
  user: createModelMock(),
  userChurchRole: createModelMock(),
  userDepartment: createModelMock(),
  ministry: createModelMock(),
  department: createModelMock(),
  member: createModelMock(),
  event: createModelMock(),
  eventDepartment: createModelMock(),
  planning: createModelMock(),
  auditLog: createModelMock(),
  notification: createModelMock(),
  serviceRequest: createModelMock(),
  memberLinkRequest: createModelMock(),
  memberUserLink: createModelMock(),
  announcement: createModelMock(),
  taskAssignment: createModelMock(),
  eventReport: createModelMock(),
  discipleship: createModelMock(),
  discipleshipAttendance: createModelMock(),
  announcementEvent: createModelMock(),
  $transaction: vi.fn((fn: (tx: typeof prismaMock) => Promise<unknown>) =>
    fn(prismaMock)
  ),
};

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
