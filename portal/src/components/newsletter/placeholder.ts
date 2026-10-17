import { Extension } from '@tiptap/react';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/** Shows placeholder text in an empty editor (styled by `p.is-editor-empty` in newsletter.css). */
export const Placeholder = (text: string) =>
	Extension.create({
		name: 'newsletterPlaceholder',
		addProseMirrorPlugins() {
			return [
				new Plugin({
					props: {
						decorations: ({ doc }) => {
							const first = doc.firstChild;
							const empty = doc.childCount === 1 && first?.isTextblock && first.content.size === 0;

							if (!empty || !first) return null;

							return DecorationSet.create(doc, [
								Decoration.node(0, first.nodeSize, {
									class: 'is-editor-empty',
									'data-placeholder': text
								})
							]);
						}
					}
				})
			];
		}
	});
