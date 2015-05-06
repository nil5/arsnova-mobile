/*
 * This file is part of ARSnova Mobile.
 * Copyright (C) 2011-2012 Christian Thomas Weber
 * Copyright (C) 2012-2015 The ARSnova Team
 *
 * ARSnova Mobile is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * ARSnova Mobile is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with ARSnova Mobile.  If not, see <http://www.gnu.org/licenses/>.
 */

Ext.define('ARSnova.view.MathJaxMarkDownPanel', {
	extend: 'Ext.Component',

	xtype: 'mathJaxMarkDownPanel',
	ui: 'normal',

	config: {
		itemId: 'content',
		title: 'MathJaxMarkDownPanel',
		cls: 'roundedBox',
		fullscreen: false,
		scrollable: {direction: 'auto'},
		styleHtmlContent: true,
		html: 'empty',
		style: 'color: black; background-color: #FFFFFF; margin-bottom: 10px'
	},

	initialize: function () {
		this.callParent(arguments);
	},

	setContent: function (content, mathJaxEnabled, markDownEnabled, mathjaxCallback) {
		var hideMediaElements = this.config.hideMediaElements;

		function urlify(text) {
			text += " ";
			var urlDelimiter = /([^="\w]https?:\/\/[^\s<]+)/g;
			var urlRegex = /(https?:\/\/[^\s]+)/g;

			return text.replace(urlDelimiter, function (delUrl) {
				return delUrl.replace(urlRegex, function (url) {
					return '<a href="' + url + '">' + url + '</a>';
				});
			});
		}

		function replaceVideoElements(content) {
			var titleDelimiter = /^.*alt="([^"]*)/;

			var youtubeDelimiters = {
				accessKey: 'youtube',
				elementDel: /<a href="https:\/\/.+(src="https:\/\/img.youtube\.com\/vi)[^<>]*><\/a>/g,
				imageDel: /<img[^<>]*(img.youtube\.com\/vi)[^<>]*><\/a>/,
				videoIdDel: /^.*vi\/?([^\/]*)/,
				titleDel: titleDelimiter
			};

			var vimeoDelimiters = {
				accessKey: 'vimeo',
				elementDel: /<a[^<>]*(vimeo\.com\/video).+a>/g,
				imageDel: /<img[^<>]*(vimeo)[^<>]*>/,
				videoIdDel: /href.+vimeo.com\/video\/([^"]*)/,
				titleDel: titleDelimiter
			};

			var videoElementReplace = function (content, delimiters) {
				return content.replace(delimiters.elementDel, function (element) {
					var videoId = element.match(delimiters.videoIdDel)[1];

					if (hideMediaElements) {
						element = '<p class="videoImageParagraph hidden">' + element + '</p>';
					} else {
						element = '<p class="videoImageParagraph">' + element + '</p>';
					}

					return element.replace(delimiters.imageDel, function (imageEl) {
						var title = element.match(delimiters.titleDel)[1];

						return '<span class="videoImageContainer" id="' + videoId + '" accesskey="'
							+ delimiters.accessKey + '" title="' + title + '">' + imageEl + '</span';
					});
				});
			};

			content = videoElementReplace(content, youtubeDelimiters);
			content = videoElementReplace(content, vimeoDelimiters);

			return content;
		}

		function replaceImageElements(content) {
			var imageDelimiter = /<img[^<>]*>/g;
			var urlDelimiter = /src="[^"]*/g;

			if (hideMediaElements) {
				return content.replace(imageDelimiter, function (element) {
					return '<img class="hidden"' + element.substr(4, element.length - 1);
				});
			}

			return content;
		}

		var features = ARSnova.app.globalConfig.features;
		if (markDownEnabled && features.markdown) {
			if (mathJaxEnabled && features.mathJax && !!window.MathJax && MathJax.Hub) {
				var replStack = [], repl;

				// replace MathJax delimiters
				var delimiterPairs = MathJax.Hub.config.tex2jax.inlineMath.concat(MathJax.Hub.config.tex2jax.displayMath);
				delimiterPairs.forEach(function (delimiterPair, i) {
					var delimiterPositions = this.getDelimiter(content, delimiterPair[0], delimiterPair[1]);
					replStack.push(repl = this.replaceDelimiter(content, delimiterPositions, '%%MATHJAX' + i + '%%'));
					content = repl.content;
				}, this);

				// converted MarkDown to HTML
				repl.content = markdown.toHTML(repl.content);

				// undo MathJax delimiter replacements in reverse order
				for (var i = replStack.length - 1; i > 0; i--) {
					replStack[i - 1].content = this.replaceBack(replStack[i]);
				}
				content = this.replaceBack(replStack[0]);
			} else {
				// directly convert Markdown if MathJax is disabled
				content = markdown.toHTML(content);
			}
		} else {
			content = Ext.util.Format.htmlEncode(content);
			content = content.replace(/\n/g, "<br />");
		}
		content = urlify(content);
		content = replaceVideoElements(content);
		content = replaceImageElements(content);
		this.setHtml(content);

		var callback = mathjaxCallback || Ext.emptyFn;
		if (mathJaxEnabled && features.mathJax && !!window.MathJax && MathJax.Hub) {
			// MathJax is enabled and content will be converted
			var queue = MathJax.Hub.Queue(["Typeset", MathJax.Hub, this.element.dom]);
			MathJax.Hub.Queue([callback, this.element.down('div')]);
		} else {
			callback(this.element.down('div'));
		}
	},

	// get all delimiter indices as array of [start(incl), end(excl)] elements
	getDelimiter: function (input, delimiter, endDelimiter) {
		// all lines between the tags to this array
		var result = []; // [start, end]

		var idxStart = 0;
		var idxEnd = -delimiter.length;
		var run = true;

		while (run) {
			// start delimiter
			idxStart = input.indexOf(delimiter, idxEnd + endDelimiter.length);

			// end delimiter
			idxEnd = input.indexOf(endDelimiter, idxStart + delimiter.length);

			if (idxStart !== -1 && idxEnd !== -1) {
				// add delimiter position values
				result.push([idxStart, idxEnd + endDelimiter.length]);
			} else {
				run = false;
			}
		}
		return result;
	},

	// replace the delimiter with idStrN (returns an array with
	// the input string including all replacements and another array with the replaced content)
	replaceDelimiter: function (input, dArr, idLabel) {
		var result = '';

		var start = 0;

		var replaced = [];

		for (var i = 0; i < dArr.length; ++i) {
			var idxStart = dArr[i][0];
			var idxEnd = dArr[i][1];

			// until start of delimiter
			result = result + input.substring(start, idxStart);

			// set id label
			result += (idLabel + i + 'X');

			// new start becomes old end
			start = idxEnd;

			// store replaced content
			replaced.push(input.substring(idxStart, idxEnd));
		}
		result += input.substring(start);

		return {content: result, source: replaced, label: idLabel};
	},

	// replace the labels back to the contents and return the string
	replaceBack: function (contentReplaced) {
		var content = contentReplaced.content;
		var replaced = contentReplaced.source;

		for (var i = replaced.length - 1; i >= 0; --i) {
			content = this.replaceWithoutRegExp(
				content,
				contentReplaced.label + i + 'X',
				Ext.util.Format.htmlEncode(replaced[i])
			);
		}

		return content;
	},

	// replace given variable with the replacement in input without using regular expressions
	replaceWithoutRegExp: function (input, find, replacement) {
		return input.split(find).join(replacement);
	}
});
