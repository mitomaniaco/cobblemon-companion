import {describe, expect, it} from 'vitest';
import {hpBarSegments} from '../src/ui/HpBar';

describe('hpBarSegments', () => {
  it.each([
    {input: [70, 36, 44], solid: 26 / 70, range: 8 / 70, level: 'mid'},
    {input: [50, 199, 235], solid: 0, range: 0, level: 'low'},
    {input: [50, 40, 60], solid: 0, range: 0.2, level: 'mid'},
    {input: [100, 10, 20], solid: 0.8, range: 0.1, level: 'high'},
    {input: [0, 1, 2], solid: 0, range: 0, level: 'low'},
  ])('segmenta $input', ({input, solid, range, level}) => {
    const result = hpBarSegments(input[0], input[1], input[2]);
    expect(result.solid).toBeCloseTo(solid, 3);
    expect(result.range).toBeCloseTo(range, 3);
    expect(result.level).toBe(level);
  });
});
