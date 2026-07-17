// Intelligence demo runner.
// Run with: npm run intelligence:demo
//
// Imports all demo-scenes/ and runs them in order.
// Each scene file exports a single run() function.

import { run as runSeq1Seq3    } from './demo-scenes/seq1-seq3';
import { run as runSceneA      } from './demo-scenes/scene-a';
import { run as runSceneB      } from './demo-scenes/scene-b';
import { run as runSceneC      } from './demo-scenes/scene-c';
import { run as runVerifyBC    } from './demo-scenes/verify-b-c';
import { run as runVerifyDEF   } from './demo-scenes/verify-d-e-f';
import { run as runSceneGH     } from './demo-scenes/scene-g-h';
import { run as runSceneI      } from './demo-scenes/scene-i';
import { run as runSceneJ      } from './demo-scenes/scene-j';
import { run as runSceneK      } from './demo-scenes/scene-k';
import { run as runSceneL      } from './demo-scenes/scene-l';
import { run as runSceneM      } from './demo-scenes/scene-m';
import { run as runSceneN      } from './demo-scenes/scene-n';
import { run as runSceneO      } from './demo-scenes/scene-o';
import { run as runSceneP      } from './demo-scenes/scene-p';
import { run as runSceneQ      } from './demo-scenes/scene-q';

runSeq1Seq3();
console.log('\n───────────────────────────────────────────────────────────────\n');
runSceneA();
runSceneB();
runSceneC();
console.log('\n═══════════════════════════════════════════════════════════════\n');
runVerifyBC();
runVerifyDEF();
runSceneGH();
runSceneI();
runSceneJ();
runSceneK();
runSceneL();
runSceneM();
runSceneN();
runSceneO();
runSceneP();
runSceneQ();

console.log('\n───────────────────────────────────────────────────────────────\n');
