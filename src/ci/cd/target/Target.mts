import type { Abi, Agent, Arch, Os } from "../agent/Agent.mjs";
import type { PipelineOptions } from "../pipeline/Pipeline.mjs";
import type { PlatformPrototype } from "../platform/Platform.mjs";
import { PlatformBuilder } from "../platform/PlatformBuilder.mjs";

export interface Target {
	os: Os;
	arch: Arch;
	abi?: Abi | undefined;
	baseline?: boolean;
}

export type TargetPrototype<Step> = {
	getTargetKey: () => string;
	getTargetLabel: () => string;
	getBuildToolchain: () => string;
	getBuildAgent: (platform: PlatformPrototype<Step>) => Agent;
	getParallelism: () => number;
};

export class Target {
	static getTargetKey = (target: Target): string => {
		const { os, arch, abi, baseline } = target;
		let key = `${os}-${arch}`;
		if (abi) {
			key += `-${abi}`;
		}
		if (baseline) {
			key += "-baseline";
		}
		return key;
	};

	static getTargetLabel = (target: Target): string => {
		const { os, arch, abi, baseline } = target;
		let label = `${os} ${arch}`;
		if (abi) {
			label += `-${abi}`;
		}
		if (baseline) {
			label += "-baseline";
		}
		return label;
	};

	/**
	 * @param {Target} target
	 * @returns {string}
	 */
	static getBuildToolchain = (target: Target): string => {
		const { os, arch, abi, baseline } = target;
		let key = `${os}-${arch}`;
		if (abi) {
			key += `-${abi}`;
		}
		if (baseline) {
			key += "-baseline";
		}
		return key;
	};

	/**
	 * @param {Target} target
	 * @returns {Agent}
	 */
	static getBuildAgent = (target: Target, options: PipelineOptions): Agent => {
		const { os, arch, abi } = target;
		const platform = (
			abi ? new PlatformBuilder().setAbi(abi) : new PlatformBuilder()
		)
			.setOs(os)
			.setArch(arch)
			.setOptions(options)
			.build();

		if (platform.isUsingNewAgent()) {
			const instanceType = arch === "aarch64" ? "c8g.8xlarge" : "c7i.8xlarge";
			return platform.getEphemeralAgent("v2", { instanceType });
		}
		return {
			queue: `build-${os}`,
			os,
			arch,
			abi,
		};
	};

	static getParallelism = (target: Target): number => {
		const { os } = target;
		if (os === "darwin") {
			return 2;
		}
		return 10;
	};
}
