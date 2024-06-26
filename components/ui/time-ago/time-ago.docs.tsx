import React from 'react';
import { Section } from '@teambit/documenter.ui.section';
import { ThemeCompositions } from '@teambit/documenter.theme.theme-compositions';
import { Separator } from '@teambit/documenter.ui.separator';
import { H3 } from '@teambit/documenter.ui.heading';
import { Paragraph } from '@teambit/documenter.ui.paragraph';
import { TimeAgo } from './time-ago';

export default function Overview() {
  return (
    <ThemeCompositions>
      <Section>
        <H3>Overview</H3>
        <Paragraph>Time-ago displays the time passed since a specific date (received as a prop).</Paragraph>
        <Separator />
      </Section>
    </ThemeCompositions>
  );
}

Overview.abstract = 'Displays the time passed since a specific date.';

Overview.labels = ['react', 'typescript', 'time', 'date'];

Overview.examples = [
  {
    scope: {
      TimeAgo,
    },
    title: 'Years time ago',
    description: 'Using the component with years ago timestamp',
    jsx: <TimeAgo date={1607550179} />,
  },
  {
    scope: {
      TimeAgo,
    },
    title: 'Months time ago',
    description: 'Using the component with months time ago',
    code: `
      () => {
        const date = new Date();
        return <TimeAgo date={new Date(date.setMonth(date.getMonth() - 10)).toString()} />;
      }
    `,
  },
  {
    scope: {
      TimeAgo,
    },
    title: 'Hours time ago',
    description: 'Using the component with hours time ago',
    code: `
      () => {
        const date = new Date();
        return <TimeAgo date={new Date(date.setHours(date.getHours() - 10)).toString()} />;
      }
    `,
  },
  {
    scope: {
      TimeAgo,
    },
    title: 'Current time',
    description: 'Using the component with current time',
    jsx: <TimeAgo date={new Date().toString()} />,
  },
  {
    scope: {
      TimeAgo,
    },
    title: 'Tooltip',
    description: 'Using the component with tooltip',
    jsx: <TimeAgo tooltip={new Date().toLocaleString()} date={new Date().toISOString()} />,
  },
];
