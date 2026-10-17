'use client';

import { useEffect, useRef } from 'react';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { Toolbar, ToolbarGroup, ToolbarSeparator } from '@/components/tiptap/tiptap-ui-primitive/toolbar';
import { HeadingDropdownMenu } from '@/components/tiptap/tiptap-ui/heading-dropdown-menu';
import { ListDropdownMenu } from '@/components/tiptap/tiptap-ui/list-dropdown-menu';
import { NodeButton } from '@/components/tiptap/tiptap-ui/node-button';
import { MarkButton } from '@/components/tiptap/tiptap-ui/mark-button';
import { LinkPopover } from '@/components/tiptap/tiptap-ui/link-popover';
import { TextAlignButton } from '@/components/tiptap/tiptap-ui/text-align-button';
import { UndoRedoButton } from '@/components/tiptap/tiptap-ui/undo-redo-button';
import { Placeholder } from './placeholder';
import { newsletterExtensions, NewsletterDoc } from './extensions';
import './newsletter.css';

type Props = {
	/** Initial document; the editor is reset when `docKey` changes */
	value: NewsletterDoc;
	docKey: string;
	onChange: (doc: NewsletterDoc, isEmpty: boolean) => void;
	placeholder?: string;
};

/** Rich-text editor for newsletters; the toolbar only offers formatting the PDF can reproduce. */
export default function NewsletterEditor({ value, docKey, onChange, placeholder = 'Write your newsletter…' }: Props) {
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const editor = useEditor({
		immediatelyRender: false,
		extensions: [...newsletterExtensions({ editable: true }), Placeholder(placeholder)],
		content: value,
		onUpdate: ({ editor: e }) => onChangeRef.current(e.getJSON() as NewsletterDoc, e.isEmpty)
	});

	// Load a different newsletter into the editor
	useEffect(() => {
		if (editor && !editor.isDestroyed) editor.commands.setContent(value);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editor, docKey]);

	return (
		<EditorContext.Provider value={{ editor }}>
			<div className="overflow-hidden rounded-lg border border-gray-300 focus-within:border-blue-600 dark:border-gray-600">
				<Toolbar className="flex flex-wrap border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-transparent">
					<ToolbarGroup>
						<UndoRedoButton action="undo" />
						<UndoRedoButton action="redo" />
					</ToolbarGroup>
					<ToolbarSeparator />
					<ToolbarGroup>
						<HeadingDropdownMenu levels={[1, 2, 3]} />
						<ListDropdownMenu types={['bulletList', 'orderedList']} />
						<NodeButton type="blockquote" />
					</ToolbarGroup>
					<ToolbarSeparator />
					<ToolbarGroup>
						<MarkButton type="bold" />
						<MarkButton type="italic" />
						<MarkButton type="underline" />
						<MarkButton type="strike" />
						<LinkPopover />
					</ToolbarGroup>
					<ToolbarSeparator />
					<ToolbarGroup>
						<TextAlignButton align="left" />
						<TextAlignButton align="center" />
						<TextAlignButton align="right" />
						<TextAlignButton align="justify" />
					</ToolbarGroup>
				</Toolbar>
				<EditorContent
					editor={editor}
					className="newsletter-content min-h-72 cursor-text px-4 py-3 [&_.ProseMirror]:min-h-64"
					onClick={() => editor?.commands.focus()}
				/>
			</div>
		</EditorContext.Provider>
	);
}
