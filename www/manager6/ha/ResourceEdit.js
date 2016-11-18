Ext.define('PVE.ha.VMResourceInputPanel', {
    extend: 'PVE.panel.InputPanel',
    onlineHelp: 'ha_manager_service_operations',
    vmid: undefined,
    
    onGetValues: function(values) {
	var me = this;

	if (me.create) {
	    values.sid = values.vmid;
	}
	

	delete values.vmid;

	PVE.Utils.delete_if_default(values, 'group', '', me.create);
	PVE.Utils.delete_if_default(values, 'max_restart', '1', me.create);
	PVE.Utils.delete_if_default(values, 'max_relocate', '1', me.create);

	return values;
    },

    initComponent : function() {
	var me = this;

	var disabledHint = Ext.createWidget({
	    xtype: 'displayfield', //submitValue is false, so we don't get submitted
	    userCls: 'pve-hint',
	    value: gettext('Disabling the resource will stop the guest system. ' +
	    'See the online help for details.'),
	    hidden: true
	});

	me.column1 = [
	    {
		xtype: me.vmid ? 'displayfield' : 'pveVMIDSelector',
		name: 'vmid',
		fieldLabel: 'VM ID',
		value: me.vmid,
		loadNextFreeVMID: false,
		validateExists: true
	    },
	    {
		xtype: 'pveIntegerField',
		name: 'max_restart',
		fieldLabel: gettext('Max. Restart'),
		value: 1,
		minValue: 0,
		maxValue: 10,
		allowBlank: false
	    },
	    {
		xtype: 'pveIntegerField',
		name: 'max_relocate',
		fieldLabel: gettext('Max. Relocate'),
		value: 1,
		minValue: 0,
		maxValue: 10,
		allowBlank: false
	    }
	];

	// value is expected to be integer as it's above, ignore that
	/*jslint confusion: true */
	me.column2 = [
	    {
		xtype: 'pveHAGroupSelector',
		name: 'group',
		fieldLabel: gettext('Group')
	    },
	    {
		xtype: 'pveKVComboBox',
		name: 'state',
		value: 'started',
		fieldLabel: gettext('Request State'),
		comboItems: [
		    ['started', gettext('Started')],
		    ['stopped', gettext('Stopped')],
		    ['disabled', gettext('Disabled')]
		],
		listeners: {
		    'change': function(field, newValue) {
			if (newValue === 'disabled') {
			    disabledHint.setVisible(true);
			}
			else {
			    if (disabledHint.isVisible()) {
				disabledHint.setVisible(false);
			    }
			}
		    }
		}
	    },
	    disabledHint
	];
	/*jslint confusion: false */

	me.columnB = [
	    {
		xtype: 'textfield',
		name: 'comment',
		fieldLabel: gettext('Comment')
	    }
	];
	
	me.callParent();
    }
});

Ext.define('PVE.ha.VMResourceEdit', {
    extend: 'PVE.window.Edit',

    vmid: undefined,

    initComponent : function() {
	var me = this;
 
	me.create = !me.vmid;

	if (me.create) {
            me.url = '/api2/extjs/cluster/ha/resources';
            me.method = 'POST';
        } else {
            me.url = '/api2/extjs/cluster/ha/resources/' + me.vmid;
            me.method = 'PUT';
        }

	var ipanel = Ext.create('PVE.ha.VMResourceInputPanel', {
	    create: me.create,
	    vmid: me.vmid
	});

	Ext.apply(me, {
            subject: gettext('VM Resource'),
	    isAdd: true,
	    items: [ ipanel ]
	});
	
	me.callParent();

	if (!me.create) {
	    me.load({
		success:  function(response, options) {
		    var values = response.result.data;

		    var regex =  /^(\S+):(\S+)$/;
		    var res = regex.exec(values.sid);

		    if (res[1] !== 'vm' && res[1] !== 'ct') {
			throw "got unexpected resource type";
		    }

		    values.vmid = res[2];
		    
		    ipanel.setValues(values);
		}
	    });
	}
    }
});
