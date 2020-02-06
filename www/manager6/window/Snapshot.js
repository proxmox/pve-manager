Ext.define('PVE.window.Snapshot', {
    extend: 'Proxmox.window.Edit',

    onGetValues: function(values) {
	let me = this;

	if (me.type === 'lxc') {
	    delete values.vmstate;
	}

	return values;
    },

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	if (!me.type) {
	    throw "no type specified";
	}

	me.items = [
	    {
		xtype: me.snapname ? 'displayfield' : 'textfield',
		name: 'snapname',
		value: me.snapname,
		fieldLabel: gettext('Name'),
		vtype: 'ConfigId',
		allowBlank: false
	    },
	    {
		xtype: 'displayfield',
		hidden: !me.snapname,
		disabled: !me.snapname,
		name: 'snaptime',
		renderer: PVE.Utils.render_timestamp_human_readable,
		fieldLabel: gettext('Timestamp')
	    },
	    {
		xtype: 'proxmoxcheckbox',
		hidden: me.type !== 'qemu' || me.snapname,
		disabled: me.type !== 'qemu' || me.snapname,
		name: 'vmstate',
		uncheckedValue: 0,
		defaultValue: 0,
		checked: 1,
		fieldLabel: gettext('Include RAM')
	    },
	    {
		xtype: 'textareafield',
		grow: true,
		editable: !me.viewonly,
		name: 'description',
		fieldLabel: gettext('Description')
	    },
	    {
		title: gettext('Settings'),
		hidden: !me.snapname,
		xtype: 'grid',
		itemId: 'summary',
		border: true,
		height: 200,
		store: {
		    model: 'KeyValue',
		    sorters: [
			{
			    property : 'key',
			    direction: 'ASC'
			}
		    ]
		},
		columns: [
		    {
			header: gettext('Key'),
			width: 150,
			dataIndex: 'key',
		    },
		    {
			header: gettext('Value'),
			flex: 1,
			dataIndex: 'value',
		    }
		]
	    }
	];

	me.url = `/nodes/${me.nodename}/${me.type}/${me.vmid}/snapshot`;

	let subject;
	if (me.snapname) {
	    subject = `${gettext('Snapshot')} ${me.snapname}`;
	    me.url += `/${me.snapname}/config`;
	} else {
	    subject = (me.type === 'qemu' ? 'VM' : 'CT') + me.vmid + ' ' + gettext('Snapshot');
	    me.method = 'POST';
	    me.showProgress = true;
	}

	Ext.apply(me, {
	    subject: subject,
	    width: me.snapname ? 620 : 450,
	    height: me.snapname ? 420 : undefined,
	});

	me.callParent();

	if (!me.snapname) {
	    return;
	}

	me.load({
	    success: function(response) {
		let kvarray = [];
		Ext.Object.each(response.result.data, function(key, value) {
		    if (key === 'description' || key === 'snaptime') {
			return;
		    }
		    kvarray.push({ key: key, value: value });
		});

		let summarystore = me.down('#summary').getStore();
		summarystore.suspendEvents();
		summarystore.add(kvarray);
		summarystore.sort();
		summarystore.resumeEvents();
		summarystore.fireEvent('refresh', summarystore);

		me.setValues(response.result.data);
	    }
	});
    }
});
