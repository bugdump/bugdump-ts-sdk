import { EventType, IncrementalSource, MouseInteractions } from '@rrweb/types';
import type { eventWithTime, serializedNodeWithId } from '@rrweb/types';
import type { UserAction } from '../types';

interface NodeInfo {
  tagName: string;
  attributes: Record<string, string | number | boolean>;
}

function buildNodeMap(node: serializedNodeWithId, map: Map<number, NodeInfo>): void {
  const anyNode = node as serializedNodeWithId & {
    tagName?: string;
    attributes?: Record<string, string | number | boolean>;
    childNodes?: serializedNodeWithId[];
  };

  if (anyNode.tagName) {
    map.set(node.id, {
      tagName: anyNode.tagName,
      attributes: anyNode.attributes ?? {},
    });
  }

  if (anyNode.childNodes) {
    for (const child of anyNode.childNodes) {
      buildNodeMap(child, map);
    }
  }
}

function describeNode(info: NodeInfo | undefined): string {
  if (!info) return 'element';

  const tag = info.tagName.toLowerCase();
  const parts: string[] = [tag];

  const id = info.attributes.id;
  if (typeof id === 'string' && id) {
    const truncated = id.length > 24 ? `${id.slice(0, 24)}…` : id;
    parts.push(`id="${truncated}"`);
  }

  const type = info.attributes.type;
  if (typeof type === 'string' && type) {
    parts.push(`type="${type}"`);
  }

  return `<${parts.join(' ')}>`;
}

/**
 * Derive a compact list of user actions (clicks, typed text, navigations) from a
 * slice of rrweb events. Timestamps are kept as absolute epoch ms so they align with
 * the replay playhead and the console/network timelines. Input values are dropped when
 * masked, so no PII is stored.
 */
export function deriveActions(events: eventWithTime[]): UserAction[] {
  if (events.length === 0) return [];

  const nodeMap = new Map<number, NodeInfo>();
  for (const event of events) {
    if (event.type === EventType.FullSnapshot) {
      buildNodeMap(event.data.node, nodeMap);
    }
  }

  const actions: UserAction[] = [];

  for (const event of events) {
    if (event.type === EventType.Meta) {
      const href = event.data.href;
      if (href) {
        actions.push({ kind: 'navigate', ts: event.timestamp, url: href });
      }
      continue;
    }

    if (event.type !== EventType.IncrementalSnapshot) continue;

    const data = event.data;

    if (data.source === IncrementalSource.MouseInteraction) {
      if (data.type === MouseInteractions.Click || data.type === MouseInteractions.DblClick) {
        actions.push({
          kind: 'click',
          ts: event.timestamp,
          selector: describeNode(nodeMap.get(data.id)),
        });
      }
      continue;
    }

    if (data.source === IncrementalSource.Input) {
      const action: UserAction = { kind: 'type', ts: event.timestamp };
      if (typeof data.text === 'string' && data.text && !data.isChecked) {
        action.value = data.text.length > 80 ? `${data.text.slice(0, 80)}…` : data.text;
      }
      actions.push(action);
    }
  }

  return actions;
}
