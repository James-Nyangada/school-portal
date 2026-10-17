'use client';

import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { newsletterExtensions, NewsletterDoc } from './extensions';
import './newsletter.css';

/** Read-only newsletter body, rendered by the same engine and styles as the editor. */
export default function NewsletterContent({ content, className = '' }: { content: NewsletterDoc; className?: string }) {
	const editor = useEditor({
		immediatelyRender: false,
		editable: false,
		extensions: newsletterExtensions({ editable: false }),
		content
	});

	useEffect(() => {
		if (editor && !editor.isDestroyed) editor.commands.setContent(content);
	}, [editor, content]);

	return (
		<EditorContent
			editor={editor}
			className={`newsletter-content ${className}`}
		/>
	);
}
