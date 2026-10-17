import { StarterKit } from '@tiptap/starter-kit';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@/components/tiptap/tiptap-extension/link-extension';

/**
 * The formatting a newsletter supports. The editor and the reader share this list, and the server's PDF renderer
 * (server/src/services/newsletter.ts) draws the same set, so all three look alike.
 */
export const newsletterExtensions = (opts: { editable: boolean }) => [
	StarterKit.configure({
		heading: { levels: [1, 2, 3] },
		code: false,
		codeBlock: false
	}),
	Underline,
	TextAlign.configure({ types: ['heading', 'paragraph'] }),
	Link.configure({
		openOnClick: !opts.editable,
		autolink: true,
		protocols: ['http', 'https', 'mailto'],
		HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' }
	})
];

export type NewsletterDoc = { type: 'doc'; content?: unknown[] };

export const EMPTY_DOC: NewsletterDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
