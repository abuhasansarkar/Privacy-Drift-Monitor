import { t } from "@pdm/shared/copy";
import { CONSENT_PHASE_LABEL } from "@pdm/shared/copy/labels";
import { FilterForm, SearchField, SelectField } from "@/components/ui/filter-form";
import type { EvidenceFilters as Filters } from "@/server/queries/evidence";

/**
 * REQUEST FILTERS — UI_DESIGN_PROMPTS §5.11.
 *
 * "A domain search input, and dropdowns for Consent phase, Resource type, plus
 * two toggle chips 'Third-party only' and 'Tracker-matched only'."
 *
 * ⚠️ A SERVER COMPONENT INSIDE A GET FORM, with no client JS. The toggles are
 * checkboxes that submit with the form; making them client-side chips would
 * ship a bundle to this page for two booleans that belong in the URL anyway.
 */
export function EvidenceFilters({
  scanId,
  filters,
  resourceTypes,
}: {
  scanId: string;
  filters: Filters;
  resourceTypes: readonly string[];
}) {
  const active =
    filters.search !== undefined ||
    filters.consentPhase !== undefined ||
    filters.resourceType !== undefined ||
    filters.thirdPartyOnly ||
    filters.trackerOnly;

  return (
    <FilterForm clearHref={active ? `?scan=${scanId}&kind=requests` : undefined}>
      {/* Carried through the submit, or filtering would jump to the newest
          scan and a different tab. */}
      <input type="hidden" name="scan" value={scanId} />
      <input type="hidden" name="kind" value="requests" />

      <SearchField
        defaultValue={filters.search}
        placeholder={t("evidence.filterDomain")}
      />
      <SelectField
        name="phase"
        label={t("evidence.filterPhase")}
        defaultValue={filters.consentPhase}
        options={[
          { value: "", label: t("evidence.anyPhase") },
          ...Object.entries(CONSENT_PHASE_LABEL).map(([value, label]) => ({
            value,
            label,
          })),
        ]}
      />
      <SelectField
        name="type"
        label={t("evidence.filterType")}
        defaultValue={filters.resourceType}
        options={[
          { value: "", label: t("evidence.anyType") },
          ...resourceTypes.map((type) => ({ value: type, label: type })),
        ]}
      />

      <label className="flex items-center gap-2 text-small">
        <input
          type="checkbox"
          name="thirdParty"
          value="1"
          defaultChecked={filters.thirdPartyOnly}
          className="size-4 accent-primary"
        />
        {t("evidence.thirdPartyOnly")}
      </label>
      <label className="flex items-center gap-2 text-small">
        <input
          type="checkbox"
          name="tracker"
          value="1"
          defaultChecked={filters.trackerOnly}
          className="size-4 accent-primary"
        />
        {t("evidence.trackerOnly")}
      </label>
    </FilterForm>
  );
}
