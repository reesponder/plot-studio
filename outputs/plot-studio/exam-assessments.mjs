import { examBriefs } from './exam-briefs.mjs';
import { gradeExam, starterProject } from './exam-grader.mjs';
import { architectV2Brief, architectV2Starter, gradeArchitectV2 } from './exam-architect-v2.mjs';
import { builderV2Brief, builderV2Starter, gradeBuilderV2 } from './exam-builder-v2.mjs';

export const currentAssessmentVersion = 2;

const expanded = Object.freeze({
  builder: Object.freeze({ brief: builderV2Brief, starter: builderV2Starter, grade: gradeBuilderV2 }),
  architect: Object.freeze({ brief: architectV2Brief, starter: architectV2Starter, grade: gradeArchitectV2 }),
});

export function assessmentFor(exam, version) {
  if (!Object.hasOwn(expanded, exam)) throw new TypeError('Unknown exam.');
  if (version === 2) return expanded[exam];
  if (version === 1) {
    return {
      brief: examBriefs[exam],
      starter: () => starterProject(exam),
      grade: (project, evaluateBackend) => gradeExam(exam, project, evaluateBackend),
    };
  }
  throw new TypeError('Unknown assessment version.');
}
