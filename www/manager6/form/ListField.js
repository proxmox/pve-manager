Ext.define('PVE.form.ListField', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.pveListField',

    mixins: [
	'Ext.form.field.Field',
    ],

    // override for column header
    fieldTitle: gettext('Item'),

    // will be applied to the textfields
    maskRe: undefined,

    allowBlank: true,
    selectAll: false,
    isFormField: true,
    deleteEmpty: false,
    selModel: 'checkboxmodel',

    config: {
	deleteEmpty: false,
    },

    viewConfig: {
	deferEmptyText: false,
    },

    setValue: function(list) {
	let me = this;
	list = Ext.isArray(list) ? list : (list ?? '').split(';');
	if (list.length > 0) {
	    me.getStore().setData(list.map(item => ({ item })));
	} else {
	    me.getStore().removeAll();
	}
	me.checkChange();
	return me;
    },

    getValue: function() {
	let me = this;
	let values = [];
	me.getStore().each((rec) => {
	    if (rec.data.item) {
		values.push(rec.data.item);
	    }
	});
	return values.join(';');
    },

    getErrors: function(value) {
	let me = this;
	let empty = false;
	me.getStore().each((rec) => {
	    if (!rec.data.item) {
		empty = true;
	    }
	});
	if (empty) {
	    return [gettext('Tag must not be empty.')];
	}
	return [];
    },

    // override framework function to implement deleteEmpty behaviour
    getSubmitData: function() {
	let me = this,
	    data = null,
	    val;
	if (!me.disabled && me.submitValue) {
	    val = me.getValue();
	    if (val !== null && val !== '') {
		data = {};
		data[me.getName()] = val;
	    } else if (me.getDeleteEmpty()) {
		data = {};
		data.delete = me.getName();
	    }
	}
	return data;
    },

    controller: {
	xclass: 'Ext.app.ViewController',

	addLine: function() {
	    let me = this;
	    me.getView().getStore().add({
		item: '',
	    });
	},

	removeSelection: function() {
	    let me = this;
	    let view = me.getView();
	    let selection = view.getSelection();
	    if (selection === undefined) {
		return;
	    }

	    selection.forEach((sel) => {
		view.getStore().remove(sel);
	    });
	    view.checkChange();
	},

	itemChange: function(field, newValue) {
	    let rec = field.getWidgetRecord();
	    if (!rec) {
		return;
	    }
	    let column = field.getWidgetColumn();
	    rec.set(column.dataIndex, newValue);
	    field.up('pveListField').checkChange();
	},
    },

    tbar: [
	{
	    text: gettext('Add'),
	    handler: 'addLine',
	},
	{
	    xtype: 'proxmoxButton',
	    text: gettext('Remove'),
	    handler: 'removeSelection',
	    disabled: true,
	},
    ],

    store: {
	listeners: {
	    update: function() {
		this.commitChanges();
	    },
	},
    },

    initComponent: function() {
	let me = this;

	me.columns = [
	    {
		header: me.fieldTtitle,
		dataIndex: 'item',
		xtype: 'widgetcolumn',
		widget: {
		    xtype: 'textfield',
		    isFormField: false,
		    maskRe: me.maskRe,
		    allowBlank: false,
		    queryMode: 'local',
		    listeners: {
			change: 'itemChange',
		    },
		},
		flex: 1,
	    },
	];

	me.callParent();
	me.initField();
    },
});
