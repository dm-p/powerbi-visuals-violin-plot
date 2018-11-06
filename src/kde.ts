module powerbi.extensibility.visual {

    export module KDE {

        /** Kernel density estimation (KDE) and support functions. Pretty much borrowed from Mike Bostock's and Andrew Sielen's Blocks:
         *      - https://bl.ocks.org/mbostock/4341954
         *      - http://bl.ocks.org/asielen/92929960988a8935d907e39e60ea8417
         */

            /**
             * Kernel density estimator - used to produce smoother estimate than a histogram
             * 
             * @param kernel        Desired (supported) kernel to run over our data
             * @param bandwidth     Desired bandwidth value to apply to our data
             * @param values        Array of values to calculate KDE over 
             */
                export function kernelDensityEstimator(kernel, bandwidth: number, values: number[]) {
                    return (sample) => {
                        return values.map(function(x) {
                            return {
                                x: x, 
                                y: d3.mean(sample, function(v: number) { 
                                    return kernel((x - v) / bandwidth); 
                                }),
                                remove: false
                            };
                        });
                    };
                }

            /**
             * If we want to converge a violin, we need to find the point at which to do so. This tries to use the
             * selected kernel to find a suitable point that we can use if not within the bounds of our data.
             * 
             * @param kernel        Desired (supported) kernel to run over our data
             * @param bandwidth     Desired bandwidth value to apply to our data
             * @param values        Array of values to calculate KDE over 
             */
                export function kernelDensityRoot(kernel, bandwidth: number, values: number[]) {
                    return function(x) {
                        return d3.mean(values, function(v) {
                            return kernel((x - v) / bandwidth);
                        });
                    }
                }

            /** Enum specifying which values are acceptable for using limits */
                export enum ELimit {
                    min,
                    max
                }

            /**
             * Recursively call the specified `kernelDensityRoot` function until a suitable interpolation/convergence
             * point is found. If not, jump out before we get too far away from our data's min/max values.
             * 
             * @param value         Value to resolve
             * @param limit         Whether the limit is a `min` or `max`
             * @param kdeRoot 
             */
                export function kernelDensityInterpolator(value: number, limit: ELimit, kdeRoot) {
                    let interY = kdeRoot(value),
                        interX = value,
                        count = 25; /** Prevent infinite loop */
                    while (count > 0 && interY != 0) {
                        switch (limit) {
                            case ELimit.max: {
                                interX += 1;
                                break;
                            }
                            case ELimit.min: {
                                interX -= 1;
                                break;
                            }
                        }
                        interY = kdeRoot(interX);
                        count -= 1;
                    }
                    return interX;
                }


        /**
         * Each kernel has a constant (if using Silverman's rule-of-thumb) and a window function to run over each data point.
         * This defines an exportable object of each supported kernel that we can use as part of our visual settings and helpers.
         */

            export interface IKernel {
                factor: number;
                window(k: number);
            }

            
            export interface IKernels {
                epanechnikov: IKernel;
                gaussian: IKernel;
                quartic: IKernel;
                triweight: IKernel;
            }

            export var kernels: IKernels = {
                epanechnikov: {
                    factor: 2.3449,
                    window: function(u) {
                        return Math.abs(u) <= 1 ? .75 * (1 - u * u) : 0;
                    }
                },
                gaussian: {
                    factor: 1.059,
                    window: function(u) {
                        /** With gaussian, we get a number tending towards zero but never reaching it for some distributions of data,
                         *  which can cause the interpolation to go on forever as it will never find a zero value. To mitigate this,
                         *  we cap the result at 4 decimal places, which is not great but preserves a representative violin shape.
                         */
                        return parseFloat((1 / Math.sqrt(2 * Math.PI) * Math.exp(-.5 * u * u)).toFixed(4));
                    }
                },
                quartic: {
                    factor: 2.7779,
                    window: function(u) {
                        var t = Math.pow(u, 2);
                        return Math.abs(u) <= 1 ? (15 / 16) * Math.pow(1 - t, 2) : 0;
                    }
                },
                triweight: {
                    factor: 3.1545,
                    window: function(u) {
                        var t = Math.pow(u, 2);
                        return Math.abs(u) <= 1 ? (35 / 32) * Math.pow(1 - t, 3) : 0;
                    }
                }
            }

    }

}