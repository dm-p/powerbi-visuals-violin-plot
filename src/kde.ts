module powerbi.extensibility.visual {

    export module KDE {

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

        /** Kernel density estimator - used to produce smoother estimate than a histogram */
            export function kernelDensityEstimator(kernel, bandwidth: number, values: number[]) {
                return (sample) => {
                    return values.map((x) => {
                        return {
                            x: x, 
                            y: d3.mean(sample, (v:number) => kernel.window((x - v) / bandwidth))
                        };
                    });
                };            
            }  

        export var kernels: IKernels = {
            epanechnikov: {
                factor: 2.3449,
                window: (u) => {
                    return Math.abs(u) <= 1 ? .75 * (1 - u * u) : 0;
                }
            },
            gaussian: {
                factor: 1.059,
                window: (u) => {
                    return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-.5 * u * u);
                }
            },
            quartic: {
                factor: 2.7779,
                window: (u) => {
                    var t = Math.pow(u, 2);
                    return Math.abs(u) <= 1 ? (15 / 16) * Math.pow(1 - t, 2) : 0;
                }
            },
            triweight: {
                factor: 3.1545,
                window: (u) => {
                    var t = Math.pow(u, 2);
                    return Math.abs(u) <= 1 ? (35 / 32) * Math.pow(1 - t, 3) : 0;
                }
            }
        }

        export var kernelGaussian: IKernel = {
            factor: 1.059,
            window: (k) => {
                return (u) => {
                    return 1 / Math.sqrt(2 * Math.PI) * Math.exp(-.5 * u * u);
                }
            }
        }

        export var kernelEpanechnikov: IKernel = {
            factor: 2.3449,
            window: (k) => {
                return (u) => {
                    return Math.abs(u /= k) <= 1 ? .75 * (1 - u * u) / k : 0;
                }
            }
        }

        export var ker

    }

}