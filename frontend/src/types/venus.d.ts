import React from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'venus-graph': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        width?: string;
        height?: string;
        ref?: any;
      };
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'venus-graph': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        width?: string;
        height?: string;
        ref?: any;
      };
    }
  }
}
