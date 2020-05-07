Ext.define('PVE.dc.ACMEPluginEditor', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveACMEPluginEditor',
    mixins: ['Proxmox.Mixin.CBind'],

    onlineHelp: 'sysadmin_certs_acme_plugins',

    isAdd: true,
    isCreate: false,

    width: 550,
    url: '/cluster/acme/plugins/',

    subject: gettext('ACME DNS Plugin'),

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
		let hintfield = me.down('field[name=hint]');
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
		let gotSchemaField = false;
		for (const [name, definition] of Object.entries(schema.fields).sort((a, b) => a[0].localeCompare(b[0]))) {
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

		    let label = name;
		    if (typeof definition.name === "string") {
			label = definition.name;
		    }

		    let field = Ext.create({
			xtype,
			name: `custom_${name}`,
			fieldLabel: label,
			width: '100%',
			labelWidth: 150,
			labelSeparator: '=',
			emptyText: definition.default || '',
			autoEl: definition.description ? {
			    tag: 'div',
			    'data-qtip': definition.description,
			} : undefined,
		    });

		    me.createdFields[name] = field;
		    container.add(field);
		    gotSchemaField = true;
		}
		datafield.setHidden(gotSchemaField); // prefer schema-fields

		if (schema.description) {
		    hintfield.setValue(schema.description);
		    hintfield.setHidden(false);
		} else {
		    hintfield.setValue('');
		    hintfield.setHidden(true);
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
		    labelWidth: 150,
		    fieldLabel: gettext('Plugin ID'),
		},
		{
		    xtype: 'proxmoxintegerfield',
		    name: 'validation-delay',
		    labelWidth: 150,
		    fieldLabel: gettext('Validation Delay'),
		    emptyText: 30,
		    cbind: {
			deleteEmpty: '{!isCreate}',
		    },
		    minValue: 0,
		    maxValue: 48*60*60,
		},
		{
		    xtype: 'pveACMEApiSelector',
		    name: 'api',
		    labelWidth: 150,
		    listeners: {
			change: function(selector) {
			    let schema = selector.getSchema();
			    selector.up('inputpanel').createSchemaFields(schema);
			},
		    },
		},
		{
		    xtype: 'textarea',
		    fieldLabel: gettext('API Data'),
		    labelWidth: 150,
		    name: 'data',
		},
		{
		    xtype: 'displayfield',
		    fieldLabel: gettext('Hint'),
		    labelWidth: 150,
		    name: 'hint',
		    hidden: true,
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
