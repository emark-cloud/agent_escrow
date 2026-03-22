export interface Milestone {
  description: string;
  monitoring_url: string;
  sla_criteria: string;
  amount: number;
  pass_count: number;
  fail_count: number;
  status: number;
  last_check_result: string;
  dispute_reason: string;
  evidence_client: string;
  evidence_provider: string;
}

export interface Agreement {
  agreement_id: string;
  client: string;
  provider: string;
  description: string;
  total_amount: number;
  milestone_count: number;
  status: number;
  court_case_id: string;
}

export interface MilestoneFormData {
  description: string;
  monitoring_url: string;
  sla_criteria: string;
  amount: string;
}
