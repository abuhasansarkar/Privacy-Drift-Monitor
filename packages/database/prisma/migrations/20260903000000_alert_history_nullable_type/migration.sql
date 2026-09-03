-- Transactional mail (team invitations, portal magic links, contact
-- acknowledgements, digests) is recorded in AlertHistory like every other
-- send, but it is not an alert: there is no trigger type that produces it,
-- and pretending there was one is how a team-invitation email arrived with
-- a `type` the enum did not contain — crashing the job AFTER the send and
-- duplicating the email on every retry. NULL now means "a send that no
-- alert rule produced"; a non-null value always names an alert trigger.
ALTER TABLE "alert_history" ALTER COLUMN "type" DROP NOT NULL;