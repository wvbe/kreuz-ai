import type { EntityDetailView } from "../../../game/api/Views";
import type { ZoneData } from "../../../game/zones/zoneTypes";
import { useEngineHost } from "../engine/useEngineHost";
import { useQuery } from "../engine/useGameState";
import { Link } from "../ui/EntityLink";
import { KeyValueList } from "../ui/KeyValueList";
import { Tabs } from "../ui/Tabs";
import { CitizenOverview, InventoryTab, JournalTab } from "./CitizenSections";
import { componentOf } from "./entityViews";
import { useEntityName } from "./EntityName";
import { DwellingInspection } from "./DwellingInspection";
import { OccupantCycler } from "./OccupantCycler";
import {
  BuildSiteInspection,
  StockpileInspection,
  WorkstationInspection,
} from "./ObjectInspection";
import { PrimaryStatus } from "./PrimaryStatus";
import { humanizeId } from "./reasonText";
import { ZoneInspection } from "./ZoneInspection";
import "./panels.css";

type PositionData = { mapId: number; cellIndex: number };

function hasComponent(detail: EntityDetailView, name: string): boolean {
  return detail.components[name] !== undefined;
}

function GenericInspection(props: { detail: EntityDetailView }) {
  const host = useEngineHost();
  const { detail } = props;
  const name = useEntityName(detail.id);
  const position = componentOf<PositionData>(detail, "Position");
  const isCharacter = hasComponent(detail, "Needs");
  const tabs = [
    ...(isCharacter
      ? [
          {
            id: "overview",
            label: "Overview",
            render: () => <CitizenOverview entityId={detail.id} />,
          },
        ]
      : []),
    ...(hasComponent(detail, "Inventory")
      ? [{ id: "inventory", label: "Inventory", render: () => <InventoryTab detail={detail} /> }]
      : []),
    ...(hasComponent(detail, "Identity")
      ? [{ id: "journal", label: "Journal", render: () => <JournalTab entityId={detail.id} /> }]
      : []),
  ];
  return (
    <div className="kv-inspection" data-kind={isCharacter ? "character" : "entity"}>
      <h4 className="kv-inspection-title">{name}</h4>
      <PrimaryStatus id={detail.id} />
      <KeyValueList
        rows={[
          { label: "Kind", value: humanizeId(detail.prototype) },
          { label: "Id", value: `#${detail.id}` },
          position === undefined
            ? null
            : {
                label: "Position",
                value: (
                  <Link
                    label={`map ${position.mapId}, cell ${position.cellIndex}`}
                    title="Centre the map here"
                    onClick={() => {
                      host.selection.requestFocus(position.mapId, position.cellIndex);
                    }}
                  />
                ),
              },
        ]}
      />
      {position === undefined ? null : (
        <OccupantCycler mapId={position.mapId} cell={position.cellIndex} current={detail.id} />
      )}
      {tabs.length > 0 ? <Tabs tabs={tabs} /> : null}
    </div>
  );
}

/**
 * Inspection of one selected entity: it picks the view by what the entity is (character, zone,
 * dwelling, workstation, build site, stockpile, anything else) and always starts with the
 * primary status line and its why popover.
 *
 * @param props - The entity id.
 * @returns The panel body.
 */
export function EntityInspection(props: { entityId: number }) {
  const entity = useQuery("entity", { id: props.entityId });
  const detail: EntityDetailView | null = entity.ok ? entity.data : null;
  if (detail === null) {
    return <p>#{props.entityId} is gone.</p>;
  }
  const zone = componentOf<ZoneData>(detail, "Zone");
  if (zone !== undefined) {
    return zone.zoneTypeId === "dwelling" ? (
      <DwellingInspection entityId={detail.id} />
    ) : (
      <ZoneInspection entityId={detail.id} />
    );
  }
  if (hasComponent(detail, "ProductionOrders")) {
    return <WorkstationInspection entityId={detail.id} />;
  }
  if (hasComponent(detail, "BuildSite")) {
    return <BuildSiteInspection entityId={detail.id} />;
  }
  if (hasComponent(detail, "Stockpile")) {
    return <StockpileInspection entityId={detail.id} />;
  }
  return <GenericInspection detail={detail} />;
}
