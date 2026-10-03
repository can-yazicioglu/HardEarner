import React from 'react';
import {Help as SharedHelp,questions} from '../../desktop/src/help.jsx';
import {lessons} from '../../desktop/src/learn-fast-content';
import guidance from './web-guidance.json';
const questionItems=[...guidance.extra.map(([title,body])=>[title,body]),...questions.map(([title,body])=>[title,guidance.questions[title]?.[0]||body])];
const lessonItems=[guidance.extra[0].slice(0,4),...lessons.map(([title,body,...rest])=>[title,guidance.lessons[title]?.[0]||body,...rest]),...guidance.extra.slice(1).map(row=>row.slice(0,4))];
export function Help(props){return <SharedHelp {...props} questionItems={questionItems} lessonItems={lessonItems}/>}
