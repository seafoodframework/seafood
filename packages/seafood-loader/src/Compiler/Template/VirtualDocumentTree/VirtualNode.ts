import {VirtualElement} from "./VirtualElement";

export abstract class VirtualNode extends VirtualElement {
    protected parsedNode: any;

    public setParsedNode(parsedNode: any): void {
        this.parsedNode = parsedNode;
    }

    public getParsedNode(): any {
        return this.parsedNode;
    }

    protected appendRenderedElement(): void {
        if (this.parentVirtualElement) {
            const parentBuildedNode = this.parentVirtualElement.getBuildedNode();
            const buildedNode = this.getBuildedNode();

            if (parentBuildedNode && buildedNode) {
                const previousSiblingNode = this.getPreviousSiblingNode();
                let nextSiblingNode = null;

                if (previousSiblingNode) {
                    nextSiblingNode = previousSiblingNode.nextSibling;
                }

                parentBuildedNode.insertBefore(buildedNode, nextSiblingNode);
            }
        }
    }
}
