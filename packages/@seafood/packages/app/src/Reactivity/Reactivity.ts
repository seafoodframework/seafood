import {DECORATOR_UNREACTIVE_FLAG} from "@seafood/component";
import "reflect-metadata";
import {REACTIVE_PROPERTY_FLAG, ReactiveProperty} from "./ReactiveProperty";
import {ReactivityWatcher} from "./ReactivityWatcher";

export class Reactivity {
    public static applyComponent(component: any): void {
        for (const propertyKey in component) {
            if (component.hasOwnProperty(propertyKey)
                && !Reflect.hasMetadata(DECORATOR_UNREACTIVE_FLAG, component, propertyKey)
            ) {
                this.applyObject(component, propertyKey);
            }
        }
    }

    public static applyObjectProperties(obj: any, parentReactiveProperty: ReactiveProperty): void {
        for (const propertyKey in obj) {
            if (obj.hasOwnProperty(propertyKey)) {
                this.applyObject(obj, propertyKey, parentReactiveProperty);
            }
        }
    }

    public static applyObject(obj: any, propertyKey: string, parentReactiveProperty?: ReactiveProperty): void {
        const propertyValue = obj[propertyKey];
        const reactiveProperty = new ReactiveProperty();

        if (parentReactiveProperty) {
            reactiveProperty.setParentReactiveProperty(parentReactiveProperty);
        }

        this.defineObjectProperty(obj, propertyKey, reactiveProperty);

        if (typeof propertyValue === "object") {
            obj[propertyKey] = new Proxy(propertyValue, {
                set: (target: any, targetPropertyKey: PropertyKey, value: any): boolean => {
                    const isArray = Array.isArray(target);

                    if (isArray && targetPropertyKey.toString() !== "length"
                        || !isArray && target.hasOwnProperty(targetPropertyKey.toString())) {
                        this.merge(
                            target[targetPropertyKey],
                            {[targetPropertyKey]: value},
                            targetPropertyKey.toString(),
                            parentReactiveProperty,
                        );
                    }

                    target[targetPropertyKey] = value;
                    reactiveProperty.notify();

                    return true;
                },
            });

            this.applyObjectProperties(obj[propertyKey], reactiveProperty);
        }

        this.watch(obj, propertyKey);
    }

    public static merge(from: any, to: any, propertyKey: string, reactiveProperty?: ReactiveProperty): void {
        const fromValue = from && from[propertyKey];
        const toValue = to[propertyKey];

        if (reactiveProperty) {
            this.defineObjectProperty(to, propertyKey, reactiveProperty);
        } else {
            this.applyObject(to, propertyKey);
        }

        if (typeof toValue === "object") {
            for (const toValuePropertyKey in toValue) {
                if (toValue.hasOwnProperty(toValuePropertyKey)) {
                    let toValueReactiveProperty;

                    if (fromValue && fromValue.hasOwnProperty(toValuePropertyKey)) {
                        toValueReactiveProperty = this.getObjectProperty(fromValue, toValuePropertyKey);
                    }

                    this.merge(fromValue, toValue, toValuePropertyKey, toValueReactiveProperty);
                }
            }
        }
    }

    public static watch(obj: any, propertyKey: string): void {
        const reactiveProperty = this.getObjectProperty(obj, propertyKey);
        const reactivityWatcher = ReactivityWatcher.getInstance();
        const property: any = {
            value: obj[propertyKey],
        };

        Object.defineProperty(obj, propertyKey, {
            get(): any {
                if (reactivityWatcher.isRecording() && reactiveProperty) {
                    const updatingFunction = reactivityWatcher.getUpdatingFunction();
                    const executingFunction = reactivityWatcher.getExecutingFunction();
                    const variables = reactivityWatcher.getVariables();

                    if (updatingFunction && executingFunction && variables) {
                        reactiveProperty.depend((depth?: number) => {
                            updatingFunction(
                                reactivityWatcher.bindContext(executingFunction)(
                                    ...Object.values(variables),
                                ),
                                depth,
                            );
                        });
                    }
                }

                return property.value;
            },
            set(value: any): void {
                property.value = value;
            },
        });
    }

    public static getObject(obj: any): ReactiveProperty {
        return Reflect.getMetadata(REACTIVE_PROPERTY_FLAG, obj);
    }

    public static getObjectProperty(obj: any, propertyKey: string): ReactiveProperty {
        return Reflect.getMetadata(REACTIVE_PROPERTY_FLAG, obj, propertyKey);
    }

    public static defineObject(obj: any, reactiveProperty: ReactiveProperty): void {
        Reflect.defineMetadata(REACTIVE_PROPERTY_FLAG, reactiveProperty, obj);
    }

    public static defineObjectProperty(obj: any, propertyKey: string, reactiveProperty: ReactiveProperty): void {
        Reflect.defineMetadata(REACTIVE_PROPERTY_FLAG, reactiveProperty, obj, propertyKey);
    }

    public static isReactive(value: any): boolean {
        return Reflect.hasMetadata(REACTIVE_PROPERTY_FLAG, value);
    }
}
