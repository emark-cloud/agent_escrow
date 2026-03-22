import { AGREEMENT_STATUS, MILESTONE_STATUS, STATUS_COLORS } from "@/lib/config";

export function AgreementStatusBadge({ status }: { status: number }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white ${STATUS_COLORS[status] || "bg-gray-500"}`}
    >
      {AGREEMENT_STATUS[status] || "Unknown"}
    </span>
  );
}

export function MilestoneStatusBadge({ status }: { status: number }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-white ${STATUS_COLORS[status] || "bg-gray-500"}`}
    >
      {MILESTONE_STATUS[status] || "Unknown"}
    </span>
  );
}
