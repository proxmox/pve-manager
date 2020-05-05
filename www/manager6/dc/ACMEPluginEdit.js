Ext.define('PVE.dc.ACMEPluginEditor', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveACMEPluginEditor',
    mixins: ['Proxmox.Mixin.CBind'],

    isAdd: true,
    isCreate: false,

    width: 400,
    url: '/cluster/acme/plugins/',

    subject: gettext('Plugin'),
    items: [
	{
	    xtype: 'inputpanel',
	    // we dynamically create fields from the given schema
	    // things we have to do here:
	    // * save which fields we created to remove them again
	    // * split the data from the generic 'data' field into the boxes
	    // * on deletion collect those values again
	    // * save the original values of the data field
	    createdFields: {},
	    createdInitially: false,
	    originalValues: {},
	    createSchemaFields: function(schema) {
		let me = this;
		// we know where to add because we define it right below
		let container = me.down('container');
		let datafield = me.down('field[name=data]');
		if (!me.createdInitially) {
		    [me.originalValues] = PVE.Parser.parseACMEPluginData(datafield.getValue());
		}

		// collect values from custom fields and add it to 'data'',
		// then remove the custom fields
		let data = [];
		for (const [name, field] of Object.entries(me.createdFields)) {
		    let value = field.getValue();
		    if (value !== undefined && value !== null && value !== '') {
			data.push(`${name}=${value}`);
		    }
		    container.remove(field);
		}
		let datavalue = datafield.getValue();
		if (datavalue !== undefined && datavalue !== null && datavalue !== '') {
		    data.push(datavalue);
		}
		datafield.setValue(data.join('\n'));

		me.createdFields = {};

		if (typeof schema.fields !== 'object') {
		    schema.fields = {};
		}
		// create custom fields according to schema
		for (const [name, definition] of Object.entries(schema.fields)) {
		    let xtype;
		    switch (definition.type) {
			case 'string':
			    xtype = 'proxmoxtextfield';
			    break;
			case 'integer':
			    xtype = 'proxmoxintegerfield';
			    break;
			case 'number':
			    xtype = 'numberfield';
			    break;
			default:
			    console.warn(`unknown type '${definition.type}'`);
			    xtype = 'proxmoxtextfield';
			    break;
		    }

		    let field = Ext.create({
			xtype,
			name: `custom_${name}`,
			fieldLabel: name,
			width: '100%',
			labelWidth: 120,
			autoEl: definition.description ? {
			    tag: 'div',
			    'data-qtip': definition.description,
			} : undefined,
		    });

		    me.createdFields[name] = field;
		    container.add(field);
		}

		// parse data from field and set it to the custom ones
		let extradata = [];
		[data, extradata] = PVE.Parser.parseACMEPluginData(datafield.getValue());
		for (const [key, value] of Object.entries(data)) {
		    if (me.createdFields[key]) {
			me.createdFields[key].setValue(value);
			me.createdFields[key].originalValue = me.originalValues[key];
		    } else {
			extradata.push(`${key}=${value}`);
		    }
		}
		datafield.setValue(extradata.join('\n'));
		if (!me.createdInitially) {
		    datafield.resetOriginalValue();
		    me.createdInitially = true; // save that we initally set that
		}
	    },
	    onGetValues: function(values) {
		let me = this;
		let win = me.up('pveACMEPluginEditor');
		if (win.isCreate) {
		    values.id = values.plugin;
		    values.type = 'dns'; // the only one for now
		}
		delete values.plugin;

		PVE.Utils.delete_if_default(values, 'validation-delay', '30', win.isCreate);

		let data = '';
		for (const [name, field] of Object.entries(me.createdFields)) {
		    let value = field.getValue();
		    if (value !== null && value !== undefined && value !== '') {
			data += `${name}=${value}\n`;
		    }
		    delete values[`custom_${name}`];
		}
		values.data = Ext.util.Base64.encode(data + values.data);
		return values;
	    },
	    items: [
		{
		    xtype: 'pmxDisplayEditField',
		    cbind: {
			editable: (get) => get('isCreate'),
			submitValue: (get) => get('isCreate'),
		    },
		    editConfig: {
			flex: 1,
			xtype: 'proxmoxtextfield',
			allowBlank: false,
		    },
		    name: 'plugin',
		    labelWidth: 120,
		    fieldLabel: gettext('Plugin'),
		},
		{
		    xtype: 'proxmoxintegerfield',
		    name: 'validation-delay',
		    labelWidth: 120,
		    fieldLabel: gettext('Validation Delay'),
		    emptyText: 30,
		    cbind: {
			deleteEmpty: '{!isCreate}',
		    },
		    minValue: 0,
		    maxValue: 172800,
		},
		{
		    xtype: 'pveACMEApiSelector',
		    name: 'api',
		    labelWidth: 120,
		    listeners: {
			change: function(selector) {
			    let schema = selector.getSchema();
			    selector.up('inputpanel').createSchemaFields(schema);
			},
		    },
		},
		{
		    fieldLabel: gettext('API Data'),
		    labelWidth: 120,
		    xtype: 'textarea',
		    name: 'data',
		},
	    ],
	},
    ],

    initComponent: function() {
	var me = this;

	me.callParent();

	if (!me.isCreate) {
	    me.load({
		success: function(response, opts) {
		    me.setValues(response.result.data);
		},
	    });
	} else {
	    me.method = 'POST';
	}
    },
});
