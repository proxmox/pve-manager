Ext.define('PVE.storage.CustomInputPanel', {
    extend: 'PVE.panel.StorageBase',

    buildFormFieldFromProperty: function (propertyName) {
        let me = this;
        let schema = me.metadata.schema;

        let property = schema[propertyName];

        if (!property) {
            console.warn(
                `Tried to create field for unknown property '${propertyName}'` +
                    ` for storage type '${me.type}'`,
            );
            return;
        }

        // Fixed properties can only be set on creation. Do not rely on the
        // field being disabled alone, as the storage edit controller
        // re-enables the preallocation field.
        let isFixed = !me.isCreate && Boolean(property.fixed);
        let fixedProps = { disabled: isFixed, readOnly: isFixed, submitValue: !isFixed };

        const predefinedFields = {
            content: {
                xtype: 'pveContentTypeSelector',
                cts: me.metadata.content.supported,
                withVolumeTypes: false,
                fieldLabel: gettext('Content'),
                name: 'content',
                value: me.metadata.content.default,
                multiSelect: true,
                allowBlank: false,
                ...fixedProps,
                validator: function () {
                    let contentTypes = Ext.Array.from(this.getValue());
                    if (contentTypes.includes('none') && contentTypes.length > 1) {
                        return gettext("'none' cannot be combined with other content types");
                    }
                    return true;
                },
            },
            preallocation: {
                xtype: 'pvePreallocationSelector',
                name: 'preallocation',
                fieldLabel: gettext('Preallocation'),
                allowBlank: false,
                deleteEmpty: !me.isCreate && Boolean(property.optional),
                ...fixedProps,
                ...(property.optional
                    ? { value: '__default__' }
                    : {
                          // a required property has no default to fall back to
                          comboItems: PVE.form.preallocationSelector.prototype.comboItems.filter(
                              ([key]) => key !== '__default__',
                          ),
                          value: property.default,
                      }),
            },
            'snapshot-as-volume-chain': {
                ...PVE.panel.StorageBase.volumeChainField(me.isCreate, me.type),
                ...fixedProps,
            },
        };

        if (predefinedFields[propertyName]) {
            return predefinedFields[propertyName];
        }

        let fieldName = propertyName;
        let extraAttributes = {
            readonly: property.fixed && !me.isCreate,
            sensitive: property.sensitive,
        };
        let context = { isCreate: me.isCreate };

        let fieldDef = Proxmox.Utils.getFieldDefFromPropertySchema(
            fieldName,
            property,
            extraAttributes,
            context,
        );

        // Fix up any field labels for properties that do not have a title key
        // by transforming the name of the field like e.g.
        // "foo_bar-baz" --> "Foo Bar Baz"
        if (!property.title) {
            let fieldLabel = fieldName
                .replace(/([-_]|\s)+/g, ' ')
                .replace(
                    /\w*/g,
                    (label) => label.charAt(0).toUpperCase() + label.slice(1).toLowerCase(),
                );
            fieldDef.fieldLabel = Ext.htmlEncode(fieldLabel);
        }

        return fieldDef;
    },

    addWidget: function (widget, isAdvanced) {
        let me = this;

        let col1, col2, colB;

        if (isAdvanced) {
            col1 = me.advancedColumn1 = me.advancedColumn1 || [];
            col2 = me.advancedColumn2 = me.advancedColumn2 || [];
            colB = me.advancedColumnB = me.advancedColumnB || [];
        } else {
            col1 = me.column1 = me.column1 || [];
            col2 = me.column2 = me.column2 || [];
            colB = me.columnB = me.columnB || [];
        }

        if (widget.xtype === 'proxmoxtextarea') {
            colB.push(widget);
            return;
        }

        if (col2.length >= col1.length) {
            col1.push(widget);
        } else {
            col2.push(widget);
        }
    },

    onGetValues: function (values) {
        let me = this;
        let schema = me.metadata.schema;

        values = me.callParent([values]);

        // set from the 'enable' checkbox, which is hidden in that case
        if (!schema.disable) {
            delete values.disable;
        }

        // Checkboxes always submit a value, but defaults should not end up in
        // the config.
        if (me.isCreate) {
            for (const [name, property] of Object.entries(schema)) {
                if (
                    property.type !== 'boolean' ||
                    !property.optional ||
                    values[name] === undefined
                ) {
                    continue;
                }

                let defaultValue = PVE.Parser.parseBoolean(String(property.default), false);
                if (PVE.Parser.parseBoolean(String(values[name])) === defaultValue) {
                    delete values[name];
                }
            }
        }

        return values;
    },

    onSetValues: function (values) {
        let me = this;

        // Never show and thus resubmit values of sensitive properties, empty means unchanged.
        for (const [name, property] of Object.entries(me.metadata.schema)) {
            if (property.sensitive) {
                delete values[name];
            }
        }

        return values;
    },

    initComponent: function () {
        let me = this;
        let schema = me.metadata.schema;

        me.column1 = me.column1 || [];
        me.column2 = me.column2 || [];

        const reservedFields = new Set([
            // automatically added in PVE.panel.StorageBase
            // --> must not be added here
            'storage',
            'nodes',
            'disable',

            // handled by the "Backup Retention" panel
            // --> must not be added here
            'prune-backups',
            'max-protected-backups',

            // not an actual property, but used by the UI as an inverse of the
            // 'disable' property
            // --> must not be added here
            'enable',

            // handled separately for consistency
            'content',
            'shared',
        ]);

        // a required property must stay settable on creation
        let isHidden = (property) => property['x-hidden'] && (property.optional || !me.isCreate);

        // Added first for consistency's sake
        for (const propertyName of ['content', 'shared']) {
            let property = schema[propertyName];
            if (!property || isHidden(property)) {
                continue;
            }

            let fieldDef = me.buildFormFieldFromProperty(propertyName);
            if (property['x-advanced']) {
                me.advancedColumn1 = me.advancedColumn1 || [];
                me.advancedColumn1.push(fieldDef);
            } else {
                me.column1.push(fieldDef);
            }
        }

        // We use regular sort without `localeCompare()`, since we want all properties to be
        // *always* in the same order, regardless of language.
        for (const [propertyName, propertySchema] of Object.entries(schema).sort()) {
            if (reservedFields.has(propertyName) || isHidden(propertySchema)) {
                continue;
            }

            let fieldDef = me.buildFormFieldFromProperty(propertyName);

            if (fieldDef === undefined) {
                continue;
            }

            me.addWidget(fieldDef, propertySchema['x-advanced']);
        }

        me.callParent();

        // PVE.panel.StorageBase adds these for every storage type
        for (const [fieldName, propertyName] of [
            ['nodes', 'nodes'],
            ['enable', 'disable'],
        ]) {
            if (!schema[propertyName]) {
                let field = me.down(`field[name=${fieldName}]`);
                field.setDisabled(true);
                field.setHidden(true);
            }
        }
    },
});
