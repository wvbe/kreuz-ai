import type { SiteView } from "../../../game/construction/constructionViews";
import { useQuery } from "../engine/useGameState";
import { KeyValueList } from "../ui/KeyValueList";
import { StackList } from "../ui/StackList";
import { useMaterialInfo } from "./entityViews";
import { EntityNameLink } from "./EntityNameLink";
import { PrimaryStatus } from "./PrimaryStatus";
import { describeReason, humanizeId } from "./reasonText";
import "./panels.css";

/**
 * Inspection of a build site: blueprint, status with the why popover, material delivered against
 * required and the builder.
 *
 * @param props - The site's entity id (the job id).
 * @returns The panel body.
 */
export function BuildSiteInspection(props: { entityId: number }) {
  const result = useQuery<SiteView | null>("site", { jobId: props.entityId });
  const site = result.ok ? result.data : null;
  const ids = site === null ? [] : site.required.map((material) => material.materialId);
  const info = useMaterialInfo(ids);
  if (site === null) {
    return <p>This build site is gone.</p>;
  }
  return (
    <div className="kv-inspection" data-kind="build-site">
      <h4 className="kv-inspection-title">
        {site.kind} of {humanizeId(site.prototypeId)}
      </h4>
      <PrimaryStatus id={props.entityId} />
      <KeyValueList
        rows={[
          { label: "Status", value: site.status },
          { label: "Progress", value: `${site.progress}/${site.durationTicks}` },
          {
            label: "Priority",
            value: `${site.priority}${site.urgent ? " (urgent)" : ""}${site.paused ? " (paused)" : ""}`,
          },
          site.builderId === null
            ? { label: "Builder", value: "none" }
            : { label: "Builder", value: <EntityNameLink entityId={site.builderId} /> },
        ]}
      />
      <h4>Materials delivered</h4>
      <StackList
        stacks={site.required.map((material) => ({
          materialId: material.materialId,
          name: info.get(material.materialId)?.name,
          quantity:
            site.delivered.find((item) => item.materialId === material.materialId)?.quantity ?? 0,
          note: `of ${material.quantity}`,
        }))}
      />
      {site.blockers.length === 0 ? null : (
        <ul>
          {site.blockers.map((blocker, index) => (
            <li key={index}>{describeReason(blocker)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
