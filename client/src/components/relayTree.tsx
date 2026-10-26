import type { RelayStatus, RelayTree, RelayTreeNode } from "@virtual-projector/shared";
import styles from "./relayTree.module.css";

const STATUS_CLASS: Record<RelayStatus, string> = {
    connecting: styles.connecting,
    waiting: styles.waiting,
    receiving: styles.receiving,
    live: styles.receiving,
    error: styles.error,
};

/** Renders a relay room's tree, plus any viewers stranded without a parent */
export default function RelayTreeView({ tree }: { tree: RelayTree }) {
    let childrenOf = (id: string) => tree.nodes.filter((n) => n.parentId === id);
    // Parentless viewers: waiting for a source (their own subtrees still hang off them)
    let detached = tree.nodes.filter((n) => n.role === "viewer" && n.parentId === null);

    let Branch = ({ node }: { node: RelayTreeNode }) => {
        let children = childrenOf(node.id);
        return (
            <li>
                <span className={`${styles.node} ${STATUS_CLASS[node.status]}`}>
                    {node.role === "source" ? "Fake client (source)" : node.id}
                    <small> {node.status} · {children.length} children</small>
                </span>
                {children.length > 0 && (
                    <ul>{children.map((c) => <Branch key={c.id} node={c} />)}</ul>
                )}
            </li>
        );
    };

    let source = tree.nodes.find((n) => n.id === tree.sourceId);

    return (
        <div className={styles.tree}>
            {source ? <ul><Branch node={source} /></ul> : <p>No source in this room.</p>}
            {detached.length > 0 && (
                <>
                    <h4>Waiting for a source</h4>
                    <ul>{detached.map((n) => <Branch key={n.id} node={n} />)}</ul>
                </>
            )}
        </div>
    );
}

/** Find Depth of the deepest node */
export function TreeDepth(tree: RelayTree): number {
    let parents = new Map(tree.nodes.map((n) => [n.id, n.parentId]));
    let max = 0;
    for (const n of tree.nodes) {
        let depth = 0;
        for (let p = n.parentId; p; p = parents.get(p) ?? null) depth++;
        max = Math.max(max, depth);
    }
    return max;
}
