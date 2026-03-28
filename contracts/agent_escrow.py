# v0.1.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
from dataclasses import dataclass


STATUS_CREATED = u256(0)
STATUS_ACTIVE = u256(1)
STATUS_COMPLETED = u256(2)
STATUS_DISPUTED = u256(3)
STATUS_CANCELLED = u256(4)

MS_PENDING = u256(0)
MS_MONITORING = u256(1)
MS_VERIFIED = u256(2)
MS_PAID = u256(3)
MS_DISPUTED = u256(4)
MS_FAILED = u256(5)
MS_REFUNDED = u256(6)

CHECKS_REQUIRED = u256(3)


@allow_storage
@dataclass
class Milestone:
    description: str
    monitoring_url: str
    sla_criteria: str
    amount: u256
    pass_count: u256
    fail_count: u256
    status: u256
    last_check_result: str
    dispute_reason: str
    evidence_client: str
    evidence_provider: str
    dispute_count: u256


@allow_storage
@dataclass
class Agreement:
    agreement_id: str
    client: Address
    provider: Address
    description: str
    total_amount: u256
    milestone_count: u256
    status: u256
    court_case_id: str


class AgentEscrow(gl.Contract):
    agreements: TreeMap[str, Agreement]
    milestones: TreeMap[str, Milestone]
    agreement_ids: DynArray[str]
    agreement_count: u256

    def __init__(self):
        self.agreement_count = u256(0)

    # --- Views ---

    @gl.public.view
    def get_agreement(self, agreement_id: str) -> Agreement:
        existing = self.agreements.get(agreement_id, None)
        if existing is None:
            raise gl.vm.UserError("Agreement not found")
        return existing

    @gl.public.view
    def get_milestone(self, agreement_id: str, milestone_index: int) -> Milestone:
        key = f"{agreement_id}:{milestone_index}"
        existing = self.milestones.get(key, None)
        if existing is None:
            raise gl.vm.UserError("Milestone not found")
        return existing

    @gl.public.view
    def get_all_agreement_ids(self) -> list[str]:
        result = []
        for i in range(len(self.agreement_ids)):
            result.append(self.agreement_ids[i])
        return result

    @gl.public.view
    def get_agreement_count(self) -> u256:
        return self.agreement_count

    @gl.public.view
    def get_agreements_by_address(self, addr: str) -> str:
        result = []
        target = addr.lower()
        for i in range(len(self.agreement_ids)):
            ag_id = self.agreement_ids[i]
            ag = self.agreements.get(ag_id, None)
            if ag is not None:
                if ag.client.as_hex.lower() == target or ag.provider.as_hex.lower() == target:
                    result.append(ag_id)
        return ",".join(result)

    @gl.public.view
    def get_last_created_id(self) -> str:
        if len(self.agreement_ids) == 0:
            return ""
        return self.agreement_ids[len(self.agreement_ids) - 1]

    # --- Write methods ---

    @gl.public.write
    def create_agreement(
        self,
        agreement_id: str,
        provider: str,
        description: str,
        ms_descriptions: str,
        ms_urls: str,
        ms_criteria: str,
        ms_amounts: str,
    ) -> bool:
        if ":" in agreement_id or "|" in agreement_id or "," in agreement_id:
            raise gl.vm.UserError("Agreement ID must not contain ':', '|', or ',' characters")

        existing = self.agreements.get(agreement_id, None)
        if existing is not None:
            raise gl.vm.UserError("Agreement ID already exists")

        sender = gl.message.sender_address
        provider_addr = Address(provider)
        if sender.as_hex.lower() == provider_addr.as_hex.lower():
            raise gl.vm.UserError("Client and provider cannot be the same address")

        descs = ms_descriptions.split("|")
        urls = ms_urls.split("|")
        crits = ms_criteria.split("|")
        amts = ms_amounts.split("|")
        count = len(descs)

        if count == 0:
            raise gl.vm.UserError("At least one milestone is required")
        if len(urls) != count or len(crits) != count or len(amts) != count:
            raise gl.vm.UserError("Milestone field counts do not match")

        total = u256(0)
        for i in range(count):
            if not descs[i].strip() or not urls[i].strip() or not crits[i].strip():
                raise gl.vm.UserError("Empty milestone fields are not allowed")
            amt = u256(int(amts[i]))
            if amt == u256(0):
                raise gl.vm.UserError("Milestone amount must be greater than zero")
            key = f"{agreement_id}:{i}"
            total = u256(total + amt)
            self.milestones[key] = Milestone(
                description=descs[i],
                monitoring_url=urls[i],
                sla_criteria=crits[i],
                amount=amt,
                pass_count=u256(0),
                fail_count=u256(0),
                status=MS_PENDING,
                last_check_result="",
                dispute_reason="",
                evidence_client="",
                evidence_provider="",
                dispute_count=u256(0),
            )

        self.agreement_count = u256(self.agreement_count + u256(1))

        self.agreements[agreement_id] = Agreement(
            agreement_id=agreement_id,
            client=sender,
            provider=provider_addr,
            description=description,
            total_amount=total,
            milestone_count=u256(count),
            status=STATUS_CREATED,
            court_case_id="",
        )

        self.agreement_ids.append(agreement_id)
        return True

    @gl.public.write
    def accept_agreement(self, agreement_id: str) -> bool:
        existing = self.agreements.get(agreement_id, None)
        if existing is None:
            raise gl.vm.UserError("Agreement not found")

        if gl.message.sender_address.as_hex.lower() != existing.provider.as_hex.lower():
            raise gl.vm.UserError("Only the provider can accept")
        if existing.status != STATUS_CREATED:
            raise gl.vm.UserError("Agreement is not in CREATED state")

        existing.status = STATUS_ACTIVE

        for i in range(int(existing.milestone_count)):
            key = f"{agreement_id}:{i}"
            ms = self.milestones[key]
            ms.status = MS_MONITORING
            self.milestones[key] = ms

        self.agreements[agreement_id] = existing
        return True

    @gl.public.write
    def check_sla(self, agreement_id: str, milestone_index: int) -> str:
        existing = self.agreements.get(agreement_id, None)
        if existing is None:
            raise gl.vm.UserError("Agreement not found")

        sender = gl.message.sender_address
        if sender.as_hex.lower() != existing.client.as_hex.lower() and sender.as_hex.lower() != existing.provider.as_hex.lower():
            raise gl.vm.UserError("Only client or provider can perform this action")

        if existing.status != STATUS_ACTIVE:
            raise gl.vm.UserError("Agreement is not active")

        key = f"{agreement_id}:{milestone_index}"
        milestone = self.milestones.get(key, None)
        if milestone is None:
            raise gl.vm.UserError("Milestone not found")

        if milestone.status != MS_MONITORING:
            raise gl.vm.UserError("Milestone is not being monitored")

        url = milestone.monitoring_url
        sla_criteria = milestone.sla_criteria

        def perform_check() -> str:
            web_data = ""
            try:
                web_data = gl.nondet.web.render(url, mode='text')
            except Exception:
                pass
            if len(web_data.strip()) < 50:
                try:
                    response = gl.nondet.web.get(url)
                    web_data = response.body.decode("utf-8") if response.body else ""
                except Exception:
                    pass
            if len(web_data) > 5000:
                web_data = web_data[:5000]

            if not web_data.strip():
                return "FAIL: Unable to fetch any data from the monitoring URL"

            prompt = f"""You are an SLA compliance monitor for an agent-to-agent escrow service.

SLA Criteria: {sla_criteria}

Live data fetched from {url}:
---
{web_data}
---

Based on the live data above, does the service currently meet the SLA criteria?

Respond with EXACTLY this format:
PASS: [one sentence explanation]
OR
FAIL: [one sentence explanation]

Nothing else."""
            return gl.nondet.exec_prompt(prompt).strip()

        result = gl.eq_principle.prompt_non_comparative(
            perform_check,
            task="Evaluate whether a service meets its SLA criteria based on live web data",
            criteria="""The response must:
1. Start with exactly PASS or FAIL
2. Include a colon and a brief explanation
3. Be based on the actual web data, not assumptions"""
        )

        if result.upper().startswith("PASS:"):
            milestone.pass_count = u256(milestone.pass_count + u256(1))
        else:
            milestone.fail_count = u256(milestone.fail_count + u256(1))

        milestone.last_check_result = result
        self.milestones[key] = milestone
        return result

    @gl.public.write
    def verify_milestone(self, agreement_id: str, milestone_index: int) -> bool:
        existing = self.agreements.get(agreement_id, None)
        if existing is None:
            raise gl.vm.UserError("Agreement not found")

        sender = gl.message.sender_address
        if sender.as_hex.lower() != existing.client.as_hex.lower() and sender.as_hex.lower() != existing.provider.as_hex.lower():
            raise gl.vm.UserError("Only client or provider can perform this action")

        if existing.status != STATUS_ACTIVE:
            raise gl.vm.UserError("Agreement is not active")

        key = f"{agreement_id}:{milestone_index}"
        milestone = self.milestones.get(key, None)
        if milestone is None:
            raise gl.vm.UserError("Milestone not found")

        if milestone.status != MS_MONITORING:
            raise gl.vm.UserError("Milestone is not being monitored")

        total_checks = milestone.pass_count + milestone.fail_count
        if total_checks < CHECKS_REQUIRED:
            raise gl.vm.UserError("Need at least 3 checks before verification")

        if milestone.pass_count <= milestone.fail_count:
            raise gl.vm.UserError("Milestone has not passed majority of SLA checks")

        milestone.status = MS_VERIFIED
        self.milestones[key] = milestone
        return True

    @gl.public.write
    def release_payment(self, agreement_id: str, milestone_index: int) -> bool:
        existing = self.agreements.get(agreement_id, None)
        if existing is None:
            raise gl.vm.UserError("Agreement not found")

        if gl.message.sender_address.as_hex.lower() != existing.client.as_hex.lower():
            raise gl.vm.UserError("Only the client can release payment")
        if existing.status != STATUS_ACTIVE:
            raise gl.vm.UserError("Agreement is not active")

        key = f"{agreement_id}:{milestone_index}"
        milestone = self.milestones.get(key, None)
        if milestone is None:
            raise gl.vm.UserError("Milestone not found")

        if milestone.status != MS_VERIFIED:
            raise gl.vm.UserError("Milestone must be verified before payment release")

        milestone.status = MS_PAID
        self.milestones[key] = milestone

        all_paid = True
        for i in range(int(existing.milestone_count)):
            k = f"{agreement_id}:{i}"
            if self.milestones[k].status != MS_PAID:
                all_paid = False
                break

        if all_paid:
            existing.status = STATUS_COMPLETED
            self.agreements[agreement_id] = existing

        return True

    @gl.public.write
    def dispute_milestone(self, agreement_id: str, milestone_index: int, reason: str) -> bool:
        existing = self.agreements.get(agreement_id, None)
        if existing is None:
            raise gl.vm.UserError("Agreement not found")

        sender = gl.message.sender_address
        if sender.as_hex.lower() != existing.client.as_hex.lower() and sender.as_hex.lower() != existing.provider.as_hex.lower():
            raise gl.vm.UserError("Only client or provider can dispute")
        if existing.status != STATUS_ACTIVE and existing.status != STATUS_DISPUTED:
            raise gl.vm.UserError("Agreement is not active")

        key = f"{agreement_id}:{milestone_index}"
        milestone = self.milestones.get(key, None)
        if milestone is None:
            raise gl.vm.UserError("Milestone not found")

        if milestone.status == MS_PAID:
            raise gl.vm.UserError("Cannot dispute a paid milestone")
        if milestone.status == MS_DISPUTED:
            raise gl.vm.UserError("Milestone is already disputed")
        if milestone.status == MS_REFUNDED:
            raise gl.vm.UserError("Cannot dispute a refunded milestone")
        if milestone.status == MS_FAILED:
            raise gl.vm.UserError("Cannot dispute a failed milestone")

        milestone.status = MS_DISPUTED
        milestone.dispute_reason = reason
        milestone.dispute_count = u256(milestone.dispute_count + u256(1))
        self.milestones[key] = milestone

        existing.status = STATUS_DISPUTED
        existing.court_case_id = f"pending-{agreement_id}-{milestone_index}"
        self.agreements[agreement_id] = existing
        return True

    @gl.public.write
    def resolve_dispute(self, agreement_id: str, milestone_index: int, verdict: str, court_address: str) -> bool:
        existing = self.agreements.get(agreement_id, None)
        if existing is None:
            raise gl.vm.UserError("Agreement not found")

        sender = gl.message.sender_address
        if sender.as_hex.lower() != existing.client.as_hex.lower() and sender.as_hex.lower() != existing.provider.as_hex.lower():
            raise gl.vm.UserError("Only client or provider can resolve disputes")

        if existing.status != STATUS_DISPUTED:
            raise gl.vm.UserError("Agreement is not in disputed state")

        key = f"{agreement_id}:{milestone_index}"
        milestone = self.milestones.get(key, None)
        if milestone is None:
            raise gl.vm.UserError("Milestone not found")

        if milestone.status != MS_DISPUTED:
            raise gl.vm.UserError("Milestone is not disputed")

        if verdict not in ("PARTY_A", "PARTY_B", "UNDETERMINED"):
            raise gl.vm.UserError("Invalid verdict")

        existing.court_case_id = court_address

        if verdict == "PARTY_B":
            milestone.status = MS_PAID
        elif verdict == "PARTY_A":
            milestone.status = MS_FAILED
        else:
            if milestone.dispute_count >= u256(2):
                milestone.status = MS_FAILED
            else:
                milestone.status = MS_MONITORING

        self.milestones[key] = milestone

        # Check if any other milestones are still disputed
        any_disputed = False
        all_done = True
        for i in range(int(existing.milestone_count)):
            k = f"{agreement_id}:{i}"
            s = self.milestones[k].status
            if s == MS_DISPUTED:
                any_disputed = True
            if s != MS_PAID and s != MS_FAILED and s != MS_REFUNDED:
                all_done = False

        if all_done:
            existing.status = STATUS_COMPLETED
        elif any_disputed:
            existing.status = STATUS_DISPUTED
        else:
            existing.status = STATUS_ACTIVE

        self.agreements[agreement_id] = existing
        return True

    @gl.public.write
    def submit_evidence(self, agreement_id: str, milestone_index: int, evidence: str) -> bool:
        existing = self.agreements.get(agreement_id, None)
        if existing is None:
            raise gl.vm.UserError("Agreement not found")

        if existing.status != STATUS_DISPUTED:
            raise gl.vm.UserError("Agreement is not in disputed state")

        key = f"{agreement_id}:{milestone_index}"
        milestone = self.milestones.get(key, None)
        if milestone is None:
            raise gl.vm.UserError("Milestone not found")

        if milestone.status != MS_DISPUTED:
            raise gl.vm.UserError("Milestone is not disputed")

        sender = gl.message.sender_address
        if sender.as_hex.lower() == existing.client.as_hex.lower():
            if milestone.evidence_client != "":
                raise gl.vm.UserError("Client evidence already submitted")
            milestone.evidence_client = evidence
        elif sender.as_hex.lower() == existing.provider.as_hex.lower():
            if milestone.evidence_provider != "":
                raise gl.vm.UserError("Provider evidence already submitted")
            milestone.evidence_provider = evidence
        else:
            raise gl.vm.UserError("Only client or provider can submit evidence")

        self.milestones[key] = milestone
        return True

    @gl.public.write
    def cancel_agreement(self, agreement_id: str) -> bool:
        existing = self.agreements.get(agreement_id, None)
        if existing is None:
            raise gl.vm.UserError("Agreement not found")

        if gl.message.sender_address.as_hex.lower() != existing.client.as_hex.lower():
            raise gl.vm.UserError("Only the client can cancel")
        if existing.status != STATUS_CREATED:
            raise gl.vm.UserError("Can only cancel before acceptance")

        existing.status = STATUS_CANCELLED
        self.agreements[agreement_id] = existing
        return True

    @gl.public.write
    def refund_failed_milestone(self, agreement_id: str, milestone_index: int) -> bool:
        existing = self.agreements.get(agreement_id, None)
        if existing is None:
            raise gl.vm.UserError("Agreement not found")

        if gl.message.sender_address.as_hex.lower() != existing.client.as_hex.lower():
            raise gl.vm.UserError("Only the client can request a refund")

        key = f"{agreement_id}:{milestone_index}"
        milestone = self.milestones.get(key, None)
        if milestone is None:
            raise gl.vm.UserError("Milestone not found")

        if milestone.status != MS_FAILED:
            raise gl.vm.UserError("Only failed milestones can be refunded")

        milestone.status = MS_REFUNDED
        self.milestones[key] = milestone

        all_terminal = True
        for i in range(int(existing.milestone_count)):
            k = f"{agreement_id}:{i}"
            s = self.milestones[k].status
            if s != MS_PAID and s != MS_FAILED and s != MS_REFUNDED:
                all_terminal = False
                break

        if all_terminal:
            existing.status = STATUS_COMPLETED
            self.agreements[agreement_id] = existing

        return True
