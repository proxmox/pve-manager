Ext.define('Proxmox.form.Tag', {
    extend: 'Ext.Component',
    alias: 'widget.pveTag',

    mode: 'editable',

    icons: {
	editable: 'fa fa-minus-square',
	normal: '',
	inEdit: 'fa fa-check-square',
    },

    tag: '',
    cls: 'pve-edit-tag',

    tpl: [
	'<i class="handle fa fa-bars"></i>',
	'<span>{tag}</span>',
	'<i class="action {iconCls}"></i>',
    ],

    // we need to do this in mousedown, because that triggers before
    // focusleave (which triggers before click)
    onMouseDown: function(event) {
	let me = this;
	if (event.target.tagName !== 'I' || event.target.classList.contains('handle')) {
	    return;
	}
	switch (me.mode) {
	    case 'editable':
		me.setVisible(false);
		me.setTag('');
		break;
	    case 'inEdit':
		me.setTag(me.tagEl().innerHTML);
		me.setMode('editable');
		break;
	    default: break;
	}
    },

    onClick: function(event) {
	let me = this;
	if (event.target.tagName !== 'SPAN' || me.mode !== 'editable') {
	    return;
	}
	me.setMode('inEdit');

	// select text in the element
	let tagEl = me.tagEl();
	tagEl.contentEditable = true;
	let range = document.createRange();
	range.selectNodeContents(tagEl);
	let sel = window.getSelection();
	sel.removeAllRanges();
	sel.addRange(range);

	me.showPicker();
    },

    showPicker: function() {
	let me = this;
	if (!me.picker) {
	    me.picker = Ext.widget({
		xtype: 'boundlist',
		minWidth: 70,
		scrollable: true,
		floating: true,
		hidden: true,
		userCls: 'proxmox-tags-full',
		displayField: 'tag',
		itemTpl: [
		    '{[Proxmox.Utils.getTagElement(values.tag, PVE.Utils.tagOverrides)]}',
		],
		store: [],
		listeners: {
		    select: function(picker, rec) {
			me.setTag(rec.data.tag);
			me.setMode('editable');
			me.picker.hide();
		    },
		},
	    });
	}
	me.picker.getStore()?.clearFilter();
	let taglist = PVE.Utils.tagList.map(v => ({ tag: v }));
	if (taglist.length < 1) {
	    return;
	}
	me.picker.getStore().setData(taglist);
	me.picker.showBy(me, 'tl-bl');
	me.picker.setMaxHeight(200);
    },

    setMode: function(mode) {
	let me = this;
	if (me.icons[mode] === undefined) {
	    throw "invalid mode";
	}
	let tagEl = me.tagEl();
	if (tagEl) {
	    tagEl.contentEditable = mode === 'inEdit';
	}
	me.removeCls(me.mode);
	me.addCls(mode);
	me.mode = mode;
	me.updateData();
    },

    onKeyPress: function(event) {
	let me = this;
	let key = event.browserEvent.key;
	switch (key) {
	    case 'Enter':
		if (me.tagEl().innerHTML !== '') {
		    me.setTag(me.tagEl().innerHTML);
		    me.setMode('editable');
		    return;
		}
		break;
	    case 'Escape':
		me.cancelEdit();
		return;
	    case 'Backspace':
	    case 'Delete':
		return;
	    default:
		if (key.match(PVE.Utils.tagCharRegex)) {
		    return;
		}
	}
	event.browserEvent.preventDefault();
	event.browserEvent.stopPropagation();
    },

    beforeInput: function(event) {
	let me = this;
	me.updateLayout();
	let tag = event.event.data ?? event.event.dataTransfer?.getData('text/plain');
	if (!tag) {
	    return;
	}
	if (tag.match(PVE.Utils.tagCharRegex) === null) {
	    event.event.preventDefault();
	    event.event.stopPropagation();
	}
    },

    onInput: function(event) {
	let me = this;
	me.picker.getStore().filter({
	    property: 'tag',
	    value: me.tagEl().innerHTML,
	    anyMatch: true,
	});
    },

    cancelEdit: function(list, event) {
	let me = this;
	if (me.mode === 'inEdit') {
	    me.setTag(me.tag);
	    me.setMode('editable');
	}
	me.picker?.hide();
    },


    setTag: function(tag) {
	let me = this;
	let oldtag = me.tag;
	me.tag = tag;
	let rgb = PVE.Utils.tagOverrides[tag] ?? Proxmox.Utils.stringToRGB(tag);

	let cls = Proxmox.Utils.getTextContrastClass(rgb);
	let color = Proxmox.Utils.rgbToCss(rgb);
	me.setUserCls(`proxmox-tag-${cls}`);
	me.setStyle('background-color', color);
	if (rgb.length > 3) {
	    let fgcolor = Proxmox.Utils.rgbToCss([rgb[3], rgb[4], rgb[5]]);

	    me.setStyle('color', fgcolor);
	} else {
	    me.setStyle('color');
	}
	me.updateData();
	if (oldtag !== tag) {
	    me.fireEvent('change', me, tag, oldtag);
	}
    },

    updateData: function() {
	let me = this;
	if (me.destroying || me.destroyed) {
	    return;
	}
	me.update({
	    tag: me.tag,
	    iconCls: me.icons[me.mode],
	});
    },

    tagEl: function() {
	return this.el?.dom?.getElementsByTagName('span')?.[0];
    },

    listeners: {
	mousedown: 'onMouseDown',
	click: 'onClick',
	focusleave: 'cancelEdit',
	keydown: 'onKeyPress',
	beforeInput: 'beforeInput',
	input: 'onInput',
	element: 'el',
	scope: 'this',
    },

    initComponent: function() {
	let me = this;

	me.setTag(me.tag);
	me.setMode(me.mode ?? 'normal');
	me.callParent();
    },

    destroy: function() {
	let me = this;
	if (me.picker) {
	    Ext.destroy(me.picker);
	}
	me.callParent();
    },
});
