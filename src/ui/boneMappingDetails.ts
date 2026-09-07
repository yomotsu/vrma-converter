import { HUMAN_BONES } from '../animation/rigMapping.ts';
import type { BoneName } from '../animation/types.ts';

export type BoneAvailability = Partial<Record<BoneName, unknown>>;

export type BoneMappingDetail = {
  name: BoneName;
  mapped: boolean;
};

export function getBoneMappingDetails(bones: BoneAvailability): BoneMappingDetail[] {
  return HUMAN_BONES.map((name) => ({
    name,
    mapped: bones[name] != null,
  }));
}
