Ext.define('PVE.panel.TagEditContainer', {
    extend: 'Ext.container.Container',
    alias: 'widget.pveTagEditContainer',

    layout: {
	type: 'hbox',
	align: 'stretch',
    },

    controller: {
	xclass: 'Ext.app.ViewController',

	loadTags: function(tagstring = '', force = false) {
	    let me = this;
	    let view = me.getView();

	    if (me.oldTags === tagstring && !force) {
		return;
	    }

	    view.suspendLayout = true;
	    me.forEachTag((tag) => {
		view.remove(tag);
	    });
	    me.getViewModel().set('tagCount', 0);
	    let newtags = tagstring.split(/[;, ]/).filter((t) => !!t) || [];
	    newtags.forEach((tag) => {
		me.addTag(tag);
	    });
	    view.suspendLayout = false;
	    view.updateLayout();
	    if (!force) {
		me.oldTags = tagstring;
	    }
	},

	onRender: function(v) {
	    let me = this;
	    let view = me.getView();
	    view.toggleCls('hide-handles', PVE.Utils.shouldSortTags());

	    view.dragzone = Ext.create('Ext.dd.DragZone', v.getEl(), {
		getDragData: function(e) {
		    let source = e.getTarget('.handle');
		    if (!source) {
			return undefined;
		    }
		    let sourceId = source.parentNode.id;
		    let cmp = Ext.getCmp(sourceId);
		    let ddel = document.createElement('div');
		    ddel.classList.add('proxmox-tags-full');
		    ddel.innerHTML = Proxmox.Utils.getTagElement(cmp.tag, PVE.Utils.tagOverrides);
		    let repairXY = Ext.fly(source).getXY();
		    cmp.setDisabled(true);
		    ddel.id = Ext.id();
		    return {
			ddel,
			repairXY,
			sourceId,
		    };
		},
		onMouseUp: function(target, e, id) {
		    let cmp = Ext.getCmp(this.dragData.sourceId);
		    if (cmp && !cmp.isDestroyed) {
			cmp.setDisabled(false);
		    }
		},
		getRepairXY: function() {
		    return this.dragData.repairXY;
		},
		beforeInvalidDrop: function(target, e, id) {
		    let cmp = Ext.getCmp(this.dragData.sourceId);
		    if (cmp && !cmp.isDestroyed) {
			cmp.setDisabled(false);
		    }
		},
	    });
	    view.dropzone = Ext.create('Ext.dd.DropZone', v.getEl(), {
		getTargetFromEvent: function(e) {
		    return e.getTarget('.proxmox-tag-dark,.proxmox-tag-light');
		},
		getIndicator: function() {
		    if (!view.indicator) {
			view.indicator = Ext.create('Ext.Component', {
			    floating: true,
			    html: '<i class="fa fa-long-arrow-up"></i>',
			    hidden: true,
			    shadow: false,
			});
		    }
		    return view.indicator;
		},
		onContainerOver: function() {
		    this.getIndicator().setVisible(false);
		},
		notifyOut: function() {
		    this.getIndicator().setVisible(false);
		},
		onNodeOver: function(target, dd, e, data) {
		    let indicator = this.getIndicator();
		    indicator.setVisible(true);
		    indicator.alignTo(Ext.getCmp(target.id), 't50-bl', [-1, -2]);
		    return this.dropAllowed;
		},
		onNodeDrop: function(target, dd, e, data) {
		    this.getIndicator().setVisible(false);
		    let sourceCmp = Ext.getCmp(data.sourceId);
		    if (!sourceCmp) {
			return;
		    }
		    sourceCmp.setDisabled(false);
		    let targetCmp = Ext.getCmp(target.id);
		    view.remove(sourceCmp, { destroy: false });
		    view.insert(view.items.indexOf(targetCmp), sourceCmp);
		},
	    });
	},

	forEachTag: function(func) {
	    let me = this;
	    let view = me.getView();
	    view.items.each((field) => {
		if (field.reference === 'addTagBtn') {
		    return false;
		}
		if (field.getXType() === 'pveTag') {
		    func(field);
		}
		return true;
	    });
	},

	toggleEdit: function(cancel) {
	    let me = this;
	    let vm = me.getViewModel();
	    let editMode = !vm.get('editMode');
	    vm.set('editMode', editMode);

	    // get a current tag list for editing
	    if (editMode) {
		PVE.Utils.updateUIOptions();
	    }

	    me.forEachTag((tag) => {
		tag.setMode(editMode ? 'editable' : 'normal');
	    });

	    if (!vm.get('editMode')) {
		let tags = [];
		if (cancel) {
		    me.loadTags(me.oldTags, true);
		} else {
		    me.forEachTag((cmp) => {
			if (cmp.isVisible() && cmp.tag) {
			    tags.push(cmp.tag);
			}
		    });
		    tags = tags.join(',');
		    if (me.oldTags !== tags) {
			me.oldTags = tags;
			me.getView().fireEvent('change', tags);
		    }
		}
	    }
	    me.getView().updateLayout();
	},

	addTag: function(tag) {
	    let me = this;
	    let view = me.getView();
	    let vm = me.getViewModel();
	    let index = view.items.indexOf(me.lookup('addTagBtn'));
	    if (PVE.Utils.shouldSortTags()) {
		index = view.items.findIndexBy(tagField => {
		    if (tagField.reference === 'addTagBtn') {
			return true;
		    }
		    return tagField.tag >= tag;
		}, 1);
	    }
	    view.insert(index, {
		xtype: 'pveTag',
		tag,
		mode: vm.get('editMode') ? 'editable' : 'normal',
		listeners: {
		    change: (field, newTag) => {
			if (newTag === '') {
			    view.remove(field);
			    vm.set('tagCount', vm.get('tagCount') - 1);
			}
		    },
		},
	    });

	    vm.set('tagCount', vm.get('tagCount') + 1);
	},

	addTagClick: function(event) {
	    let me = this;
	    if (event.target.tagName === 'SPAN') {
		me.lookup('addTagBtn').tagEl().innerHTML = '';
		me.lookup('addTagBtn').updateLayout();
	    }
	},

	addTagMouseDown: function(event) {
	    let me = this;
	    if (event.target.tagName === 'I') {
		let tag = me.lookup('addTagBtn').tagEl().innerHTML;
		if (tag !== '') {
		    me.addTag(tag, true);
		}
	    }
	},

	addTagChange: function(field, tag) {
	    let me = this;
	    if (tag !== '') {
		me.addTag(tag, true);
	    }
	    field.tag = '';
	},

	cancelClick: function() {
	    this.toggleEdit(true);
	},

	editClick: function() {
	    this.toggleEdit(false);
	},

	init: function(view) {
	    let me = this;
	    if (view.tags) {
		me.loadTags(view.tags);
	    }

	    me.mon(Ext.GlobalEvents, 'loadedUiOptions', () => {
		view.toggleCls('hide-handles', PVE.Utils.shouldSortTags());
		me.loadTags(me.oldTags, true); // refresh tag colors and order
	    });
	},
    },

    viewModel: {
	data: {
	    tagCount: 0,
	    editMode: false,
	},

	formulas: {
	    hideNoTags: function(get) {
		return get('editMode') || get('tagCount') !== 0;
	    },
	    editBtnHtml: function(get) {
		let cls = get('editMode') ? 'check' : 'pencil';
		let qtip = get('editMode') ? gettext('Apply Changes') : gettext('Edit Tags');
		return `<i data-qtip="${qtip}" class="fa fa-${cls}"></i>`;
	    },
	},
    },

    loadTags: function() {
	return this.getController().loadTags(...arguments);
    },

    items: [
	{
	    xtype: 'box',
	    bind: {
		hidden: '{hideNoTags}',
	    },
	    html: gettext('No Tags'),
	},
	{
	    xtype: 'pveTag',
	    reference: 'addTagBtn',
	    cls: 'pve-add-tag',
	    mode: 'editable',
	    tag: '',
	    tpl: `<span>${gettext('Add Tag')}</span><i class="action fa fa-plus-square"></i>`,
	    bind: {
		hidden: '{!editMode}',
	    },
	    hidden: true,
	    onMouseDown: Ext.emptyFn, // prevent default behaviour
	    listeners: {
		click: {
		    element: 'el',
		    fn: 'addTagClick',
		},
		mousedown: {
		    element: 'el',
		    fn: 'addTagMouseDown',
		},
		change: 'addTagChange',
	    },
	},
	{
	    xtype: 'box',
	    html: `<i data-qtip="${gettext('Cancel')}" class="fa fa-times"></i>`,
	    cls: 'pve-tag-inline-button',
	    hidden: true,
	    bind: {
		hidden: '{!editMode}',
	    },
	    listeners: {
		click: 'cancelClick',
		element: 'el',
	    },
	},
	{
	    xtype: 'box',
	    cls: 'pve-tag-inline-button',
	    bind: {
		html: '{editBtnHtml}',
	    },
	    listeners: {
		click: 'editClick',
		element: 'el',
	    },
	},
    ],

    listeners: {
	render: 'onRender',
    },

    destroy: function() {
	let me = this;
	Ext.destroy(me.dragzone);
	Ext.destroy(me.dropzone);
	Ext.destroy(me.indicator);
	me.callParent();
    },
});
