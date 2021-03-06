import { Reactivity } from '@fistache/reactivity'
import { AttributeKeyword, ComponentAttributes, Event, TagAttrib } from '@fistache/shared'
import { AttributeProperties, DECORATOR_ATTRIBUTE_FLAG } from './Decorators/attribute'
import { unreactive } from './Decorators/unreactive'
import { parseArgs } from './Decorators/use'
import { Styler } from './Styles/Styler'
import { VirtualComponent } from './VirtualNode/VirtualComponent'
import { VirtualElement } from './VirtualNode/VirtualElement'
import { VirtualEmbeddedContent } from './VirtualNode/VirtualEmbeddedContent'
import { VirtualNode } from './VirtualNode/VirtualNode'
import { VirtualPackage } from './VirtualNode/VirtualPackage'
import { VirtualSlot } from './VirtualNode/VirtualSlot'
import { VirtualTextNode } from './VirtualNode/VirtualTextNode'

import { DECORATOR_UNREACTIVE_FLAG } from '@fistache/shared'
export { Event } from '@fistache/shared'

export interface ComponentEventInterface {
    bindEvent(eventName: Event, callback: () => void): void

    fireEvent(eventName: Event): void
}

export const COMPONENT_SYMBOL = Symbol('COMPONENT_SYMBOL')

// todo: make a seperate class to implement render functionality
export abstract class Component implements ComponentEventInterface {
    public static renderFragment(
        stack: VirtualNode[],
        attachBefore?: Node | null
    ) {
        while (stack.length) {
            const virtualNode = stack.pop() as VirtualNode

            virtualNode.render(attachBefore)

            // shouldRenderChildVirtualNodes instead of instanceof check
            // to improve performance
            if (virtualNode.shouldRenderChildVirtualNodes()) {
                // Get child nodes only after render because virtual
                // package can create a new one.
                const childVirtualNodes = (virtualNode as VirtualElement)
                    .getChildVirtualNodes().slice().reverse()

                stack.push(...childVirtualNodes)
            }
        }
    }

    @unreactive()
    protected attributes = new Map<string | symbol, AttributeProperties>()

    @unreactive()
    protected eventHandlers: Event[][] = []

    @unreactive()
    protected usedStuff?: Map<string, any>

    @unreactive()
    protected usedComponents?: Map<string, new () => Component>

    @unreactive()
    // tslint:disable-next-line: variable-name
    private __fileId: any

    @unreactive()
    // tslint:disable-next-line: variable-name
    private __hmr: any

    @unreactive()
    // tslint:disable-next-line: variable-name
    private __render!: (
        element: any,
        component: any,
        embeddedContent: any,
        slot: any,
        text: any,
        include: any
    ) => VirtualNode

    @unreactive()
    // tslint:disable-next-line: variable-name
    private __style: any

    @unreactive()
    private shouldAppendStyle = false

    @unreactive()
    private embeddedContent?: VirtualNode[]

    @unreactive()
    private reactivity = new Reactivity(this)

    @unreactive()
    private element!: Element

    @unreactive()
    private virtualNode!: VirtualNode

    @unreactive()
    private initialized = false

    @unreactive()
    private styler!: Styler

    public render(
        element: Element,
        embeddedContent?: VirtualNode[]
    ): Node | null {
        const node = this.initializeAndRender(element, embeddedContent)

        if (node) {
            element.appendChild(node)
        }

        return node
    }

    public replace(
        element: Element,
        embeddedContent?: VirtualNode[]
    ): Node | null {
        const node = this.initializeAndRender(element, embeddedContent)

        if (node) {
            element.replaceChild(node, element.lastChild as Node)
        }

        return node
    }

    public rerender() {
        this.appendStyle(true)
        this.virtualNode.delete()
        this.render(this.element, this.embeddedContent)
    }

    public setAttribute(this: any, name: string, value: any): void {
        if (this.attributes.has(name)) {
            // todo: add type checking in dev mode
            this[name] = value
        }
    }

    public checkRequeredAttributesExistance(this: any): void {
        // todo: disable for production
        for (const attribute of this.attributes) {
            if (attribute[1]!.required
                && this[attribute[0]] === null
                || this[attribute[0]] === undefined
            ) {
                throw new Error(
                    `Required attribute '${attribute[0]}' had not ` +
                    `been set.`
                )
            }
        }
    }

    public bindEvent(eventName: Event, callback: () => void) {
        if (!this.eventHandlers.hasOwnProperty(eventName)) {
            this.eventHandlers[eventName] = []
        }

        (this.eventHandlers as any)[eventName].push(callback)
    }

    public unbindEvent(eventName: Event) {
        this.eventHandlers[eventName] = []
    }

    public fireEvent(eventName: Event) {
        if (this.eventHandlers.hasOwnProperty(eventName)) {
            (this.eventHandlers as any)[eventName].forEach(
                (event: () => void) => {
                    event()
                }
            )
        }
    }

    public getUsedComponents(): Map<string, new () => Component> | undefined {
        return this.usedComponents
    }

    public use(args: any) {
        const parsedArgs = parseArgs(args)

        if (this.usedComponents) {
            for (const item of parsedArgs.usedComponents) {
                this.usedComponents.set(item[0], item[1])
            }
        } else {
            this.usedComponents = parsedArgs.usedComponents
        }

        if (this.usedStuff) {
            for (const item of parsedArgs.usedStuff) {
                this.usedStuff.set(item[0], item[1])
            }
        } else {
            this.usedStuff = parsedArgs.usedStuff
        }
    }

    public setStyler(styler: Styler) {
        this.styler = styler
    }

    public enableStyles() {
        this.shouldAppendStyle = true
    }

    public clone() {
        const component = new (this.constructor as any)()

        component.usedStuff = this.usedStuff
        component.usedComponents = this.usedComponents

        return component
    }

    public setAttributes() {
        // tslint:disable-next-line: forin
        for (const propertyKey in this) {
            const properties: AttributeProperties = Reflect.getMetadata(
                DECORATOR_ATTRIBUTE_FLAG, this, propertyKey
            )

            if (properties) {
                this.attributes.set(propertyKey, properties)
            }
        }
    }

    private renderElement = (
        element: string,
        attributes?: ComponentAttributes,
        children?: VirtualNode[]
    ): VirtualElement => {
        const virtualElement = new VirtualElement(element, attributes)
        const forExpression = this.extractForExpressionIfExists(attributes)
        let position = 0

        virtualElement.getScope().setContext(this)

        if (children) {
            for (const child of children) {
                virtualElement.addChildVirtualNode(child)
                child.setParentVirtualElement(virtualElement)
                child.setPrimaryPosition(position)

                child.getScope().setParentScope(virtualElement.getScope())
                child.getScope().setContext(this)

                position++
            }
        }

        return forExpression
            ? new VirtualPackage(virtualElement, forExpression)
            : virtualElement
    }

    private renderComponent = (
        component: new () => Component,
        attributes?: ComponentAttributes,
        embeddedContent?: VirtualNode[]
    ): VirtualElement => {
        const virtualComponent = new VirtualComponent(
            new component(), attributes
        )
        const forExpression = this.extractForExpressionIfExists(attributes)
        let position = 0

        if (this.shouldAppendStyle) {
            virtualComponent.getComponent().enableStyles()
        }

        virtualComponent.getComponent().setStyler(this.styler)
        virtualComponent.getScope().setContext(this)

        if (embeddedContent) {
            for (const child of embeddedContent) {
                virtualComponent.addChildVirtualNode(child)
                child.setParentVirtualElement(virtualComponent)
                child.setSecondaryPosition(position)

                child.getScope().setParentScope(virtualComponent.getScope())
                child.getScope().setContext(this)

                position++
            }
        }

        return forExpression
            ? new VirtualPackage(virtualComponent, forExpression)
            : virtualComponent
    }

    private renderEmbeddedContent = (id: string | null) => {
        let embeddedContent: VirtualNode[] | null | undefined
            = this.embeddedContent

        if (id) {
            const slot = this.getEmbeddedContentSlot(id)
            if (slot) {
                embeddedContent = slot.getEmbeddedContent()
            }
        }

        return new VirtualEmbeddedContent(
            embeddedContent
                ? embeddedContent.slice()
                : undefined
        )
    }

    private renderSlot = (
        id: string,
        embeddedContent: VirtualNode[] | null
    ) => {
        return new VirtualSlot(id, embeddedContent)
    }

    private renderText = (expression: string): VirtualTextNode => {
        // todo: render if text is a root node
        return new VirtualTextNode(expression)
    }

    private resolveComponent = (name: string): new () => Component => {
        if (name === 'parent') {
            try {
                const parent: any = Reflect.getPrototypeOf(
                    Reflect.getPrototypeOf(this)
                )
                return parent.constructor
            } catch (e) {
                this.throwComponentNotFoundException(name)
            }
        }

        if (!this.usedComponents) {
            return this.throwComponentNotFoundException(name)
        }

        const component = this.usedComponents.get(name)

        if (!component) {
            return this.throwComponentNotFoundException(name)
        }

        return component
    }

    private throwComponentNotFoundException(name: string): never {
        if (name === 'parent') {
            throw new Error(
                `Cannot find parent component template. ` +
                `Please make sure you are extending this component of a ` +
                `component with a template.`
            )
        } else {
            throw new Error(`Component with name '${name}' not found.`)
        }
    }

    private getEmbeddedContentSlot(id: string): VirtualSlot | null {
        if (this.embeddedContent) {
            for (const child of this.embeddedContent) {
                // getEmbeddedContent instead of instanceof check
                // to improve performance
                if ((child as VirtualSlot).getEmbeddedContent
                    && (child as VirtualSlot).getId() === id) {
                    return child as VirtualSlot
                }
            }
        }

        return null
    }

    private makeReactive() {
        this.reactivity.bindComponent(DECORATOR_UNREACTIVE_FLAG)
    }

    private extractForExpressionIfExists(
        attributes?: ComponentAttributes
    ): string | false {
        if (attributes && attributes[AttributeKeyword.Special]) {
            const specialAttributes =
                attributes[AttributeKeyword.Special] as TagAttrib[]
            const forAttrib = specialAttributes.find((attrib: TagAttrib) => {
                return attrib.name === 'for'
            })

            if (forAttrib) {
                return forAttrib.value as string
            }
        }

        return false
    }

    private enableHmr() {
        this.bindHmrEvents()
    }

    private bindHmrEvents() {
        if (this.__hmr && this.__hmr.events) {
            const events = this.__hmr.events[Event.Created]

            if (events && events.length) {
                this.bindEvent(Event.Created, events[0].bind(this))
            }
        }
    }

    private appendStyle(replace = false) {
        // todo: refactor style for server and client
        if (this.shouldAppendStyle && this.__style) {
            this.styler.use(this.__fileId, this.__style, replace)
        }
    }

    private initializeAndRender(
        element: Element,
        embeddedContent?: VirtualNode[]
    ): Node | null {
        this.makeReactive()

        if (!this.initialized) {
            // todo: hmr only if dev env
            this.enableHmr()
            this.fireEvent(Event.Created)
            this.initialized = true
            this.appendStyle()
        }

        this.element = element
        this.embeddedContent = embeddedContent

        this.virtualNode = this.__render(
            this.renderElement,
            this.renderComponent,
            this.renderEmbeddedContent,
            this.renderSlot,
            this.renderText,
            this.resolveComponent
        )

        Component.renderFragment([this.virtualNode])

        return this.virtualNode.getNode()
    }
}
