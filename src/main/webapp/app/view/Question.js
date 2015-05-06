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
/**
 * We need to override this class in order to allow custom itemHeights on list elements
 */
Ext.define('ARSnova.view.PositionMap', {
	override: 'Ext.util.PositionMap',
	config: {
		minimumHeight: 0
	}
});

Ext.define('ARSnova.view.Question', {
	extend: 'Ext.Panel',

	requires: [
		'ARSnova.model.Answer',
		'ARSnova.view.CustomMask',
		'ARSnova.view.MathJaxMarkDownPanel',
		'ARSnova.view.speaker.ShowcaseEditButtons'
	],

	config: {
		padding: '0 0 50 0',

		scrollable: {
			direction: 'vertical',
			directionLock: true
		}
	},

	abstentionInternalId: 'ARSnova_Abstention',
	abstentionAnswer: null,

	initialize: function () {
		this.callParent(arguments);

		var me = this, self = this; // for use inside callbacks
		this.viewOnly = this.config.viewOnly;
		this.questionObj = this.config.questionObj;

		this.customMask = Ext.create('ARSnova.view.CustomMask', {
			mainPanel: this
		});

		if (ARSnova.app.userRole === ARSnova.app.USER_ROLE_SPEAKER) {
			this.editButtons = Ext.create('ARSnova.view.speaker.ShowcaseEditButtons', {
				questionObj: this.questionObj
			});
		}

		var answerStore = Ext.create('Ext.data.Store', {model: 'ARSnova.model.Answer'});
		answerStore.add(this.questionObj.possibleAnswers);
		answerStore.each(function (item) {
			if (ARSnova.app.globalConfig.parseAnswerOptionFormatting) {
				var md = Ext.create('ARSnova.view.MathJaxMarkDownPanel');
				md.setContent(item.get('text'), true, true, function (html) {
					item.set('formattedText', html.getHtml());
					md.destroy();
				});
			} else {
				item.set('formattedText', Ext.util.Format.htmlEncode(item.get('text')));
			}
		});

		this.on('preparestatisticsbutton', function (button) {
			var scope = self;
			button.scope = this;
			button.setHandler(function () {
				scope.statisticButtonHandler(scope);
			});
		});

		var saveAnswer = function (answer) {
			answer.saveAnswer(self.questionObj._id, {
				success: function () {
					var questionsArr = Ext.decode(localStorage.getItem(self.questionObj.questionVariant + 'QuestionIds'));
					if (questionsArr.indexOf(self.questionObj._id) === -1) {
						questionsArr.push(self.questionObj._id);
					}
					localStorage.setItem(self.questionObj.questionVariant + 'QuestionIds', Ext.encode(questionsArr));

					if (self.questionObj.questionType !== 'flashcard') {
						self.disableQuestion();
						if (!self.questionObj.piRoundActive) {
							ARSnova.app.mainTabPanel.tabPanel.userQuestionsPanel.showNextUnanswered();
							ARSnova.app.mainTabPanel.tabPanel.userQuestionsPanel.checkIfLastAnswer();
						}
					}
				},
				failure: function (response, opts) {
					console.log('server-side error');
					Ext.Msg.alert(Messages.NOTIFICATION, Messages.ANSWER_CREATION_ERROR);
				}
			});
		};

		this.markCorrectAnswers = function () {
			if (this.questionObj.showAnswer) {
				// Mark all possible answers as 'answered'. This will highlight
				// all correct answers.

				this.answerList.getStore().each(function (item) {
					item.set("questionAnswered", true);
				});

				if (this.questionObj.questionType === 'grid') {
					this.setGridAnswer(this.questionObj.userAnswered);
				}
			}
		};

		this.saveMcQuestionHandler = function () {
			Ext.Msg.confirm('', Messages.SUBMIT_ANSWER, function (button) {
				if (button !== 'yes') {
					return;
				}

				var selectedIndexes = [];
				this.answerList.getSelection().forEach(function (node) {
					selectedIndexes.push(this.answerList.getStore().indexOf(node));
				}, this);
				this.markCorrectAnswers();

				var answerValues = [];
				for (var i = 0; i < this.answerList.getStore().getCount(); i++) {
					answerValues.push(selectedIndexes.indexOf(i) !== -1 ? "1" : "0");
				}

				self.getUserAnswer().then(function (answer) {
					answer.set('answerText', answerValues.join(","));
					saveAnswer(answer);
				});

				this.buttonContainer.setHidden(true);
			}, this);
		};

		this.saveGridQuestionHandler = function (grid) {
			Ext.Msg.confirm('', Messages.SUBMIT_ANSWER, function (button) {
				if (button !== 'yes') {
					return;
				}

				var selectedIndexes = [];
				this.grid.getChosenFields().forEach(function (node) {
					selectedIndexes.push(node[0] + ';' + node[1]);
				}, this);
				this.questionObj.userAnswered = selectedIndexes.join(",");
				this.markCorrectAnswers();

				self.getUserAnswer().then(function (answer) {
					answer.set('answerText', selectedIndexes.join(","));
					saveAnswer(answer);
				});

				this.buttonContainer.setHidden(true);
			}, this);
		};

		this.mcAbstentionHandler = function () {
			self.answerList.deselectAll();
			Ext.Msg.confirm('', Messages.SUBMIT_ANSWER, function (button) {
				if (button !== 'yes') {
					return;
				}

				self.getUserAnswer().then(function (answer) {
					answer.set('abstention', true);
					self.answerList.deselectAll();
					saveAnswer(answer);
				});

				this.buttonContainer.setHidden(true);
			}, this);
		};

		// MC and Flash Card questions have their own handlers...
		var answerable = ['mc', 'flashcard'].indexOf(this.questionObj.questionType) === -1;
		var questionListener = this.viewOnly || !answerable ? {} : {
			'itemtap': function (list, index, target, record) {
				var confirm = function (answer, handler) {
					Ext.Msg.confirm(Messages.ANSWER + ' "' + answer + '"', Messages.SUBMIT_ANSWER, handler);
				};
				if (record.get('id') === self.abstentionInternalId) {
					return confirm(Messages.ABSTENTION, function (button) {
						if (button !== 'yes') {
							return;
						}
						self.getUserAnswer().then(function (answer) {
							answer.set('abstention', true);
							saveAnswer(answer);
						});
					});
				}
				var answerObj = self.questionObj.possibleAnswers[index];

				/* for use in Ext.Msg.confirm */
				answerObj.selModel = list;
				answerObj.target = target;

				var theAnswer = answerObj.id || answerObj.text;

				confirm(theAnswer, function (button) {
					if (button === 'yes') {
						self.markCorrectAnswers();

						self.getUserAnswer().then(function (answer) {
							answer.set('answerText', answerObj.text);
							saveAnswer(answer);
						});
					} else {
						answerObj.selModel.deselect(answerObj.selModel.selected.items[0]);
					}
				});
			}
		};

		// Setup question title and text to display in the same field; markdown handles HTML encoding
		var questionString = this.questionObj.subject.replace(/\./, "\\.")
			+ '\n\n' // inserts one blank line between subject and text
			+ this.questionObj.text;

		// Create standard panel with framework support
		var questionPanel = Ext.create('ARSnova.view.MathJaxMarkDownPanel', {
			cls: "roundedBox allCapsHeader"
		});
		questionPanel.setContent(questionString, true, true);

		if (this.questionObj.questionType === 'flashcard') {
			var answerPanel = Ext.create('ARSnova.view.MathJaxMarkDownPanel', {
				style: 'word-wrap: break-word;',
				cls: ''
			});

			this.answerList = Ext.create('Ext.Container', {
				layout: 'vbox',
				cls: 'roundedBox',
				style: 'margin-bottom: 10px;',
				styleHtmlContent: true
			});

			if (this.questionObj.fcImage) {
				this.flashcardGrid = Ext.create('ARSnova.view.components.GridImageContainer', {
					itemId: 'flashcardGridImageContainer' + this.questionObj._id,
					editable: false,
					gridIsHidden: true,
					style: 'margin-bottom: 20px'
				});

				this.flashcardGrid.setImage(this.questionObj.fcImage);
				this.answerList.add(this.flashcardGrid);
			}

			this.answerList.add(answerPanel);

			// remove padding around panel
			this.answerList.bodyElement.dom.style.padding = "0";

			// set content
			answerPanel.setContent(this.questionObj.possibleAnswers[0].text, true, true);
		} else {
			this.answerList = Ext.create('Ext.List', {
				store: answerStore,

				cls: 'roundedBox',
				variableHeights: true,
				scrollable: {disabled: true},

				itemCls: 'arsnova-mathdown x-html answerListButton noPadding',
				itemHeight: 32,
				itemTpl: new Ext.XTemplate(
					'{formattedText}',
					'<tpl if="correct === true && this.isQuestionAnswered(values)">',
						'&nbsp;<span class="listCorrectItem x-list-item-correct">&#10003; </span>',
					'</tpl>',
					{
						isQuestionAnswered: function (values) {
							return values.questionAnswered === true;
						}
					}
				),
				listeners: {
					scope: this,
					selectionchange: function (list, records, eOpts) {
						if (list.getSelectionCount() > 0) {
							this.mcSaveButton.enable();
						} else {
							this.mcSaveButton.disable();
						}
					},
					/**
					 * The following events are used to get the computed height of
					 * all list items and finally to set this value to the list
					 * DataView. In order to ensure correct rendering it is also
					 * necessary to get the properties "padding-top" and
					 * "padding-bottom" and add them to the height of the list
					 * DataView.
					 */
					painted: function (list, eOpts) {
						this.answerList.fireEvent("resizeList", list);

						if (window.MathJax) {
							MathJax.Hub.Queue(
								["Delay", MathJax.Callback, 700],
								function () {
									me.answerList.fireEvent('resizeList', me.answerList.element);
								}
							);
						}
					},
					resizeList: function (list) {
						var listItemsDom = list.select(".x-list .x-inner .x-inner").elements[0];

						this.answerList.setHeight(
							parseInt(window.getComputedStyle(listItemsDom, "").getPropertyValue("height")) +
							parseInt(window.getComputedStyle(list.dom, "").getPropertyValue("padding-top")) +
							parseInt(window.getComputedStyle(list.dom, "").getPropertyValue("padding-bottom"))
						);
					}
				},
				mode: this.questionObj.questionType === "mc" ? 'MULTI' : 'SINGLE'
			});
		}

		if (this.questionObj.abstention
				&& (this.questionObj.questionType === 'school'
					|| this.questionObj.questionType === 'vote'
					|| this.questionObj.questionType === 'abcd'
					|| this.questionObj.questionType === 'yesno'
			|| (this.questionObj.questionType === 'mc' && this.viewOnly))) {
			this.abstentionAnswer = this.answerList.getStore().add({
				id: this.abstentionInternalId,
				text: Messages.ABSTENTION,
				correct: false
			})[0];
			// has to be set this way as it does not conform to the model
			this.abstentionAnswer.set('formattedText', Messages.ABSTENTION);
		}

		this.mcSaveButton = Ext.create('Ext.Button', {
			flex: 1,
			ui: 'confirm',
			cls: 'login-button noMargin',
			text: Messages.SAVE,
			handler: !this.viewOnly ? this.saveMcQuestionHandler : function () {},
			scope: this,
			disabled: true
		});

		this.abstentionButton = !!!this.questionObj.abstention ? {hidden: true} : Ext.create('Ext.Button', {
			flex: 1,
			ui: 'action',
			xtype: 'button',
			cls: 'login-button noMargin',
			text: Messages.ABSTENTION,
			handler: this.mcAbstentionHandler,
			scope: this
		});

		this.formPanel = Ext.create('Ext.form.Panel', {
			scrollable: null
		});

		this.buttonContainer = Ext.create('Ext.Container', {
			layout: {
				type: 'hbox',
				align: 'stretch'
			},
			defaults: {
				style: {
					margin: '10px'
				}
			},
			hidden: !!this.questionObj.userAnswered || !!this.questionObj.isAbstentionAnswer
		});

		var flashcardContainer = {
			xtype: 'button',
			cls: 'login-button',
			ui: 'confirm',
			text: Messages.SHOW_FLASHCARD_ANSWER,
			handler: function (button) {
				if (this.answerList.isHidden()) {
					this.answerList.show(true);
					button.setText(Messages.HIDE_FLASHCARD_ANSWER);
					self.getUserAnswer().then(function (answer) {
						var answerObj = self.questionObj.possibleAnswers[0];
						answer.set('answerText', answerObj.text);
						if (!self.viewOnly) {
							saveAnswer(answer);
						}
					});
				} else {
					this.answerList.hide(true);
					button.setText(Messages.SHOW_FLASHCARD_ANSWER);
					ARSnova.app.mainTabPanel.tabPanel.userQuestionsPanel.next();
					ARSnova.app.mainTabPanel.tabPanel.userQuestionsPanel.checkIfLastAnswer();
				}
			},
			scope: this
		};

		this.formPanel.add([questionPanel]);

		if (this.questionObj.image && this.questionObj.questionType !== "grid") {
			this.grid = Ext.create('ARSnova.view.components.GridImageContainer', {
				id: 'gridImageContainer' + this.questionObj._id,
				editable: false,
				gridIsHidden: true
			});
			this.grid.setImage(this.questionObj.image);
			this.formPanel.add(this.grid);
		}

		this.formPanel.add(this.answerList);

		if (this.questionObj.questionType === "mc") {
			this.buttonContainer.add([
				this.mcSaveButton,
				this.abstentionButton
			]);

			this.formPanel.add(!this.viewOnly ? this.buttonContainer : {});
			this.answerList.setHidden(false);
		} else if (this.questionObj.questionType === "flashcard") {
			this.formPanel.add([flashcardContainer]);
			this.answerList.setHidden(true);
		} else if (this.questionObj.questionType === "grid") {
			if (this.questionObj.gridType === 'moderation') {
				this.grid = Ext.create('ARSnova.view.components.GridModerationContainer', {
					id: 'gridImageContainer' + this.questionObj._id,
					handlerScope: self,
					onClickHandler: function () {
						var remainingDots = self.grid.getNumberOfDots() - self.grid.getChosenFields().length;
						Ext.get('remainingDotsLabel' + self.getId()).setText(Messages.GRID_LABEL_REMAINING_DOTS + remainingDots);
					}
				});
			} else {
				this.grid = Ext.create('ARSnova.view.components.GridImageContainer', {
					id: 'gridImageContainer' + this.questionObj._id
				});
			}

			this.grid.setPossibleAnswers(this.questionObj.possibleAnswers);
			this.grid.setImage(this.questionObj.image, false, function () {
				me.setGridAnswer(me.questionObj.userAnswered);
			});

			/*
			 * update function for align the grids picture
			 */
			this.grid.update(this.questionObj, false);

			/*
			 *   gridbutton and container for the grid button to add into the layout if necessary
			 */
			this.gridButton = Ext.create('Ext.Button', {
				flex: 1,
				ui: 'confirm',
				cls: 'login-button noMargin',
				text: Messages.SAVE,
				handler: !this.viewOnly ? this.saveGridQuestionHandler : function () {},
				scope: this,
				disabled: false
			});

			this.formPanel.add([this.grid]);

			if (this.questionObj.gridType === 'moderation') {
				var panel = new Ext.Panel({
					layout: {
						type: 'vbox',
						align: 'center',
						pack: 'center'
					},
					style: "margin-top: 15px",
					items: [{
						xtype: 'label',
						id: 'remainingDotsLabel' + this.getId(),
						html: Messages.GRID_LABEL_REMAINING_DOTS + this.grid.getNumberOfDots()
					}]
				});

				this.formPanel.add(panel);
			}

			if (!this.viewOnly) {
				this.buttonContainer.add([
					this.gridButton,
					this.abstentionButton
				]);

				this.formPanel.add([this.buttonContainer]);
			}
			this.answerList.setHidden(true);
		} else {
			this.answerList.setHidden(false);
		}

		this.countdownTimer = Ext.create('ARSnova.view.components.CountdownTimer', {
			docked: 'top',
			viewOnly: true,
			hidden: true
		});

		this.add([
			this.formPanel, this.countdownTimer,
			this.editButtons ? this.editButtons : {}
		]);

		this.on('activate', function () {
			this.answerList.addListener('itemtap', questionListener.itemtap);
			this.checkPiRoundActivation();

			if (this.viewOnly) {
				this.setAnswerCount();
			}

			if (this.isDisabled() || this.questionObj.votingDisabled) {
				this.disableQuestion();
			}

			if (ARSnova.app.userRole === ARSnova.app.USER_ROLE_SPEAKER) {
				if (this.questionObj.piRoundActive) {
					this.editButtons.hide();
				} else {
					this.editButtons.show();
				}
			}
		});

		this.on('deactivate', function () {
			this.countdownTimer.hide();
		});

		this.on('painted', function () {
			if (ARSnova.app.userRole === ARSnova.app.USER_ROLE_SPEAKER) {
				this.updateEditButtons();
			}
		});
	},

	checkPiRoundActivation: function () {
		if (this.questionObj.piRoundActive) {
			this.countdownTimer.start(this.questionObj.piRoundStartTime, this.questionObj.piRoundEndTime);
			this.countdownTimer.show();
		} else {
			this.countdownTimer.hide();
		}
	},

	updateEditButtons: function () {
		this.editButtons.questionObj = this.questionObj;
		this.editButtons.updateData(this.questionObj);
	},

	statisticButtonHandler: function (scope) {
		if (ARSnova.app.userRole === ARSnova.app.USER_ROLE_SPEAKER) {
			this.questionObj = this.editButtons.questionObj;
		}

		ARSnova.app.getController('Statistics').prepareStatistics(scope);
	},

	getQuestionTypeMessage: function (msgAppendix) {
		var message;
		msgAppendix = msgAppendix ? msgAppendix : "";

		switch (this.questionObj.questionType) {
			case "vote":
				message = "EVALUATION";
				break;
			case "flashcard":
				msgAppendix = msgAppendix.length ? "" : "_SHORT";
				/* fall through */
			default:
				message = this.questionObj.questionType.toUpperCase();
		}

		if (!Messages[message + msgAppendix]) {
			message = "QUESTION";
			msgAppendix = "";
		}

		return Messages[message + msgAppendix];
	},

	setAnswerCount: function () {
		var questionType = this.questionObj.questionType;
		var sTP = ARSnova.app.mainTabPanel.tabPanel.speakerTabPanel;

		ARSnova.app.answerModel.getAnswerAndAbstentionCount(this.questionObj._id, {
			success: function (response) {
				var numAnswers = JSON.parse(response.responseText),
					answerCount = parseInt(numAnswers[0]),
					abstentionCount = parseInt(numAnswers[1]);

				if (questionType === 'flashcard') {
					sTP.showcaseQuestionPanel.toolbar.setAnswerCounter(answerCount, Messages.ANSWERS_SHOWN);
				} else if (answerCount === abstentionCount && answerCount !== 0) {
					sTP.showcaseQuestionPanel.toolbar.setAnswerCounter(abstentionCount, Messages.ABSTENTION);
				} else {
					sTP.showcaseQuestionPanel.toolbar.setAnswerCounter(answerCount);
				}
			},
			failure: function () {
				console.log('server-side error');
			}
		});
	},

	/*
	 * function to set the users answers after setting the last answer.
	 */
	setGridAnswer: function (answerString) {
		if (answerString === undefined) {
			return;
		}


		var grid = this.grid;
		var fields = answerString.split(",");

		if (this.questionObj.showAnswer) {
			var correctAnswers = [];
			var userAnswers = [];

			this.questionObj.possibleAnswers.forEach(function (node) {
				if (node.correct) {
					correctAnswers.push(1);
				} else {
					correctAnswers.push(0);
				}
				userAnswers.push(0);
			});


			fields.forEach(function (node) {
				var coord = grid.getChosenFieldFromPossibleAnswer(node);
				userAnswers[(coord[0] * grid.getGridSizeY()) + coord[1]] = 1;
			});

			grid.generateUserViewWithAnswers(userAnswers, correctAnswers);
		} else {
			fields.forEach(function (node) {
				var entry = grid.getChosenFieldFromPossibleAnswer(node);
				grid.getChosenFields().push(entry);
			});
		}
	},

	disableQuestion: function () {
		if (ARSnova.app.userRole !== ARSnova.app.USER_ROLE_SPEAKER) {
			this.setDisabled(true);
			this.mask(this.customMask);
		}
	},

	enableQuestion: function () {
		if (!this.questionObj.userAnswered) {
			this.setDisabled(false);
			this.setMasked(false);
		}
	},

	selectAbstentionAnswer: function () {
		var index = this.answerList.getStore().indexOf(this.abstentionAnswer);
		if (index !== -1) {
			this.answerList.select(this.abstentionAnswer);
		}
	},

	getUserAnswer: function () {
		var self = this;
		var promise = new RSVP.Promise();
		ARSnova.app.answerModel.getUserAnswer(self.questionObj._id, {
			empty: function () {
				var answer = Ext.create('ARSnova.model.Answer');
				promise.resolve(answer);
			},
			success: function (response) {
				var theAnswer = Ext.decode(response.responseText);
				// update
				var answer = Ext.create('ARSnova.model.Answer', theAnswer);
				promise.resolve(answer);
			},
			failure: function () {
				console.log('server-side error');
				promise.reject();
			}
		});
		return promise;
	}
});
