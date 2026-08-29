import { vi } from "vitest";

// Deep mock factory for Prisma models
function createModelMock() {
  return {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
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
  session: createModelMock(),
  userChurchRole: createModelMock(),
  userDepartment: createModelMock(),
  ministry: createModelMock(),
  department: createModelMock(),
  member: createModelMock(),
  memberDepartment: createModelMock(),
  event: createModelMock(),
  eventDepartment: createModelMock(),
  planning: createModelMock(),
  auditLog: createModelMock(),
  notification: createModelMock(),
  request: createModelMock(),
  memberLinkRequest: createModelMock(),
  memberUserLink: createModelMock(),
  absence: createModelMock(),
  absenceBackup: createModelMock(),
  announcement: createModelMock(),
  taskAssignment: createModelMock(),
  eventReport: createModelMock(),
  discipleship: createModelMock(),
  discipleshipAttendance: createModelMock(),
  announcementEvent: createModelMock(),
  mediaEvent: createModelMock(),
  mediaProject: createModelMock(),
  mediaFile: createModelMock(),
  mediaFileVersion: createModelMock(),
  mediaPhoto: createModelMock(),
  mediaShareToken: createModelMock(),
  mediaSettings: createModelMock(),
  msdpFollowUp: createModelMock(),
  // Module agenda
  pastoralProfile: createModelMock(),
  appointmentRequest: createModelMock(),
  agendaEntry: createModelMock(),
  // Module service d'accueil
  welcomeDutyFamily: createModelMock(),
  welcomeDutyAssignment: createModelMock(),
  // Module emploi
  jobOffer: createModelMock(),
  jobSeeker: createModelMock(),
  jobNotificationSubscription: createModelMock(),
  freelanceMission: createModelMock(),
  freelanceProfile: createModelMock(),
  // Module rooms
  room: createModelMock(),
  roomAccess: createModelMock(),
  roomReservation: createModelMock(),
  roomChecklist: createModelMock(),
  // Module audio
  audioSettings: createModelMock(),
  audioService: createModelMock(),
  audioSource: createModelMock(),
  audioSegment: createModelMock(),
  audioRendition: createModelMock(),
  audioServiceTemplate: createModelMock(),
  audioJob: createModelMock(),
  audioShareToken: createModelMock(),
  // Module comptabilité
  financialSeries: createModelMock(),
  financialRequest: createModelMock(),
  financialAttachment: createModelMock(),
  financialPayment: createModelMock(),
  $queryRaw: vi.fn(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction: vi.fn((arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prismaMock))),
};

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
