import { LanguageId, LanguageOption } from '../types';

export const LANGUAGES: LanguageOption[] = [
  { id: 'javascript', label: 'JavaScript', monacoId: 'javascript', runnable: true },
  { id: 'typescript', label: 'TypeScript', monacoId: 'typescript', runnable: true },
  { id: 'python', label: 'Python', monacoId: 'python', runnable: false },
  { id: 'java', label: 'Java', monacoId: 'java', runnable: false },
  { id: 'cpp', label: 'C++', monacoId: 'cpp', runnable: false },
];

export const DEFAULT_LANGUAGE: LanguageId = 'javascript';

export function getLanguage(id: string | undefined): LanguageOption {
  return LANGUAGES.find((l) => l.id === id) ?? LANGUAGES[0];
}

/** Starter code a user can insert into an empty file. Two Sum is the classic warm-up. */
export const STARTER_CODE: Record<LanguageId, string> = {
  javascript: `// Two Sum: return indices of the two numbers that add up to target.
function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}

console.log(twoSum([2, 7, 11, 15], 9)); // [0, 1]
`,
  typescript: `// Two Sum: return indices of the two numbers that add up to target.
function twoSum(nums: number[], target: number): [number, number] | [] {
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    const j = seen.get(need);
    if (j !== undefined) return [j, i];
    seen.set(nums[i], i);
  }
  return [];
}

console.log(twoSum([2, 7, 11, 15], 9)); // [0, 1]
`,
  python: `# Two Sum: return indices of the two numbers that add up to target.
def two_sum(nums: list[int], target: int) -> list[int]:
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return []

print(two_sum([2, 7, 11, 15], 9))  # [0, 1]
`,
  java: `import java.util.*;

class Solution {
    // Two Sum: return indices of the two numbers that add up to target.
    public int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            Integer j = seen.get(target - nums[i]);
            if (j != null) return new int[] { j, i };
            seen.put(nums[i], i);
        }
        return new int[0];
    }
}
`,
  cpp: `#include <unordered_map>
#include <vector>
using namespace std;

// Two Sum: return indices of the two numbers that add up to target.
vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> seen;
    for (int i = 0; i < (int)nums.size(); i++) {
        auto it = seen.find(target - nums[i]);
        if (it != seen.end()) return {it->second, i};
        seen[nums[i]] = i;
    }
    return {};
}
`,
};
